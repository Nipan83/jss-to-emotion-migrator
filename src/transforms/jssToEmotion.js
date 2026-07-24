/**
 * JSS → Emotion transformer (element-centric strategy).
 *
 * Produces the pattern used across the imaging-fe migration: one
 * `styled(<MuiComponent | 'htmlTag'>)` component per JSX element that consumed
 * JSS classes, instead of the deprecated PREFIX + `classes` object + `<Root>`
 * wrapper.
 *
 * Handles, per element:
 *   - `className={classes.x}`                         → styled component (top-level styles)
 *   - `className={classnames(classes.a, {[classes.b]: cond})}` → boolean prop + shouldForwardProp
 *   - `classes={{ root, indicator, selected, ... }}`  → slot → selector mapping
 *       root         → top-level
 *       state slot   → `&.Mui-<state>`
 *       other slot   → `& .Mui<Base>-<slot>`
 *
 * Plus file-level cleanup:
 *   - removes makeStyles / useStyles / withStyles / compose(withStyles(...))
 *   - removes the `classes` prop (destructuring, PropTypes, child plumbing)
 *   - rewrites imports (`@mui/styles` → `@mui/material/styles` styled)
 *   - drops now-unused external style objects
 *
 * Non-goals (left to the developer, by design): choosing sx vs styled,
 * hex → CSS-variable substitution, splitting into separate `-styles.js` files.
 */

const fs = require('fs');
const path = require('path');

const {
  findJSSImports,
  findDefaultJSSImports,
  removeJSSImports,
  addStyledImport,
  extractStyleObjectFromMakeStyles,
  deriveStyledComponentName,
  usesTheme,
  slotToSelector,
} = require('../utils');

const MODULE_EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

// ------------------------------------------------------------------ AST helpers

const STRIP_KEYS = new Set([
  'loc', 'start', 'end', 'range', 'tokens', 'comments', 'extra', 'original',
  'leadingComments', 'trailingComments', 'innerComments',
]);

/**
 * Deep-clones an AST node, stripping positional / recast metadata so the clone
 * is safe to relocate and reprint (and never shares identity with the source).
 */
function cloneNode(node) {
  if (Array.isArray(node)) {
    return node.map(cloneNode);
  }
  if (node && typeof node === 'object') {
    const out = {};
    for (const key of Object.keys(node)) {
      if (STRIP_KEYS.has(key)) continue;
      out[key] = cloneNode(node[key]);
    }
    return out;
  }
  return node;
}

/**
 * Renames every `Identifier` named `from` to `to` inside a (plain-object) node.
 */
function renameIdentifier(node, from, to) {
  if (Array.isArray(node)) {
    node.forEach(n => renameIdentifier(n, from, to));
    return;
  }
  if (node && typeof node === 'object') {
    if (node.type === 'Identifier' && node.name === from) {
      node.name = to;
    }
    for (const key of Object.keys(node)) {
      renameIdentifier(node[key], from, to);
    }
  }
}

function isUpperFirst(name) {
  return !!name && name[0] === name[0].toUpperCase();
}

/** Builds an object spread (`...arg`) node compatible with the babel printer. */
function buildObjectSpread(j, arg) {
  if (typeof j.spreadElement === 'function') {
    return j.spreadElement(arg);
  }
  return j.spreadProperty(arg);
}

/** Builds a string-keyed object property: `'selector': value`. */
function buildSelectorProperty(j, selector, valueObject) {
  const prop = j.property('init', j.literal(selector), valueObject);
  prop.computed = false;
  return prop;
}

// ------------------------------------------------------- style source resolution

/**
 * Resolves a styles argument (object / arrow / identifier / createStyles) to its
 * `{ styleObject, themeParam }`. `ctx` (optional) enables cross-file resolution
 * of imported style objects: `{ filePath, imports: Map<name, source> }`.
 */
function resolveStyles(j, root, arg, externalStyles, ctx) {
  if (!arg) return { styleObject: null, themeParam: null };

  if (arg.type === 'ObjectExpression') {
    return { styleObject: arg, themeParam: null };
  }
  if (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') {
    return extractStyleObjectFromMakeStyles(arg);
  }
  if (arg.type === 'Identifier') {
    const external = externalStyles.get(arg.name);
    if (external) {
      return extractStyleObjectFromMakeStyles(external.init);
    }
    let result = { styleObject: null, themeParam: null };
    root.find(j.VariableDeclarator, { id: { name: arg.name } }).forEach(path => {
      if (path.node.init) {
        result = extractStyleObjectFromMakeStyles(path.node.init);
      }
    });
    if (result.styleObject) return result;
    // Cross-file: the styles object is imported from a sibling module.
    if (ctx && ctx.imports && ctx.imports.has(arg.name)) {
      const resolved = resolveImportedStyleObject(j, arg.name, ctx.imports.get(arg.name), ctx.filePath);
      if (resolved.styleObject) return resolved;
    }
    return result;
  }
  if (arg.type === 'CallExpression' &&
      arg.callee.type === 'Identifier' && arg.callee.name === 'createStyles') {
    return resolveStyles(j, root, arg.arguments[0], externalStyles, ctx);
  }
  return { styleObject: null, themeParam: null };
}

/** Resolves a relative module specifier to an on-disk file path. */
function resolveModulePath(fromFile, source) {
  if (!fromFile || !source || !source.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), source);
  for (const ext of MODULE_EXTS) {
    const candidate = base + ext;
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch (e) { /* not this one */ }
  }
  return null;
}

/**
 * Reads a sibling module and extracts the exported style object bound to
 * `importedName` (default or named export). Best-effort; returns nulls on any
 * failure so the caller falls back to leaving the file untouched.
 */
function resolveImportedStyleObject(j, importedName, importInfo, filePath) {
  try {
    const modPath = resolveModulePath(filePath, importInfo.source);
    if (!modPath) return { styleObject: null, themeParam: null };
    const src = fs.readFileSync(modPath, 'utf-8');
    const modRoot = j(src);

    // Locate the initializer for the exported binding.
    let init = null;

    if (importInfo.kind === 'default') {
      // export default <expr>  |  export default styles (const styles = ...)
      modRoot.find(j.ExportDefaultDeclaration).forEach(p => {
        const decl = p.node.declaration;
        if (!decl) return;
        if (decl.type === 'Identifier') {
          modRoot.find(j.VariableDeclarator, { id: { name: decl.name } }).forEach(vp => {
            if (vp.node.init) init = vp.node.init;
          });
        } else {
          init = decl;
        }
      });
    } else {
      // named: export const <name> = ...  |  export { <name> }
      modRoot.find(j.VariableDeclarator, { id: { name: importInfo.imported } }).forEach(vp => {
        if (vp.node.init) init = vp.node.init;
      });
    }

    if (!init) return { styleObject: null, themeParam: null };
    return extractStyleObjectFromMakeStyles(init);
  } catch (e) {
    return { styleObject: null, themeParam: null };
  }
}

/** Finds `const styles = ...` / `const xxxStyles = ...` external style definitions. */
function findExternalStyleDefinitions(j, root) {
  const defs = new Map();
  root.find(j.VariableDeclarator).forEach(path => {
    const id = path.node.id;
    if (id.type !== 'Identifier') return;
    const name = id.name;
    if ((name === 'styles' || name.endsWith('Styles') || name.endsWith('Style')) && path.node.init) {
      defs.set(name, { path, init: path.node.init });
    }
  });
  return defs;
}

/**
 * True when a style object has a per-class *function* value, e.g.
 * `{ root: props => ({ ... }) }`. These dynamic styles need manual
 * `shouldForwardProp` work, so the tool leaves such files untouched rather than
 * silently dropping the dynamic styles.
 */
function hasFunctionValuedStyleProp(styleObject) {
  if (!styleObject || styleObject.type !== 'ObjectExpression') return false;
  return styleObject.properties.some(p =>
    p.value && (p.value.type === 'ArrowFunctionExpression' || p.value.type === 'FunctionExpression'));
}

/**
 * Builds a Map of classKey → style value node from a style ObjectExpression.
 */
function buildStyleMap(styleObject) {
  const map = new Map();
  if (!styleObject || styleObject.type !== 'ObjectExpression') return map;
  styleObject.properties.forEach(prop => {
    if (!prop.key) return;
    const key = prop.key.name || prop.key.value;
    map.set(key, prop.value);
  });
  return map;
}

// --------------------------------------------------------- classnames detection

/** Local identifiers bound to classnames / clsx imports. */
function findClassnamesLocals(j, root) {
  const locals = new Set();
  root.find(j.ImportDeclaration).forEach(path => {
    const source = path.node.source.value;
    if (source === 'classnames' || source === 'clsx') {
      path.node.specifiers.forEach(spec => {
        if (spec.type === 'ImportDefaultSpecifier' || spec.type === 'ImportSpecifier') {
          locals.add(spec.local.name);
        }
      });
    }
  });
  return locals;
}

/**
 * Collects all imported local names, plus a local→canonical map for `@mui/*`
 * imports (so an aliased `Dialog as MuiDialog` resolves selectors/names against
 * the real component `Dialog`, not the alias).
 */
function findImportedNames(j, root) {
  const importedNames = new Set();
  const muiCanonical = new Map();
  root.find(j.ImportDeclaration).forEach(path => {
    const source = path.node.source.value;
    const isMui = typeof source === 'string' && source.startsWith('@mui/');
    (path.node.specifiers || []).forEach(spec => {
      if (!spec.local) return;
      importedNames.add(spec.local.name);
      if (!isMui) return;
      if (spec.type === 'ImportSpecifier' && spec.imported) {
        muiCanonical.set(spec.local.name, spec.imported.name);
      } else if (spec.type === 'ImportDefaultSpecifier') {
        muiCanonical.set(spec.local.name, spec.local.name);
      }
    });
  });
  return { importedNames, muiCanonical };
}

/**
 * Maps local import name → `{ source, kind: 'default'|'named', imported }` for
 * every import declaration (used for cross-file style resolution).
 */
function buildImportsMap(j, root) {
  const map = new Map();
  root.find(j.ImportDeclaration).forEach(path => {
    const source = path.node.source.value;
    (path.node.specifiers || []).forEach(spec => {
      if (!spec.local) return;
      if (spec.type === 'ImportDefaultSpecifier') {
        map.set(spec.local.name, { source, kind: 'default', imported: 'default' });
      } else if (spec.type === 'ImportSpecifier') {
        map.set(spec.local.name, { source, kind: 'named', imported: spec.imported.name });
      }
    });
  });
  return map;
}

/**
 * Converts inline styled-component definitions built with withStyles, e.g.
 *   const StyledIconButton = withStyles({ root: {...} })(IconButton);
 * into
 *   const StyledIconButton = styled(IconButton)({...});
 * (root slot flattened, other slots mapped like a `classes` prop). Returns the
 * number converted. These are NOT HOCs and must be handled before HOC removal.
 */
function convertInlineWithStyles(j, root, withStylesLocal, importedNames, muiCanonical, externalStyles, ctx) {
  let converted = 0;
  let bail = false;
  root.find(j.VariableDeclarator).forEach(path => {
    const init = path.node.init;
    if (!init || init.type !== 'CallExpression') return;
    if (!isWithStylesCall(init.callee, withStylesLocal)) return;
    if (init.arguments.length !== 1) return;
    const wrapped = init.arguments[0];
    if (!wrapped || wrapped.type !== 'Identifier' || !importedNames.has(wrapped.name)) return;

    const { styleObject, themeParam } = resolveStyles(j, root, init.callee.arguments[0], externalStyles, ctx);
    if (!styleObject) return;
    if (hasFunctionValuedStyleProp(styleObject)) { bail = true; return; }

    const slotMap = buildStyleMap(styleObject);
    const canonical = muiCanonical.get(wrapped.name) || wrapped.name;
    const analysis = {
      simpleClasses: [],
      slotClasses: [...slotMap.keys()].map(k => ({ slot: k, classKeys: [k] })),
      conditionals: [],
    };
    const { styleObjectExpr, componentUsesTheme, propNames } =
      buildStyleObject(j, analysis, canonical, slotMap, themeParam);
    path.node.init = buildStyledCall(j, wrapped.name, true, styleObjectExpr, componentUsesTheme, propNames);
    converted++;
  });
  return { converted, bail };
}

// ----------------------------------------------------------- element analysis

/**
 * Extracts `classes.<key>` from a member expression given the classes var name.
 */
function classKeyFromMember(node, classesVar) {
  if (node && node.type === 'MemberExpression' && node.object &&
      node.object.type === 'Identifier' && node.object.name === classesVar &&
      node.property) {
    return node.property.name || node.property.value;
  }
  return null;
}

/**
 * Analyzes one JSX opening element's style-bearing attributes.
 * Returns null when the element consumes no JSS classes.
 */
function analyzeElement(j, openingElement, classesVar, classnamesLocals) {
  const simpleClasses = [];      // [classKey]
  const slotClasses = [];        // [{ slot, classKeys: [classKey] }]
  const conditionals = [];       // [{ classKey, cond, propName }]
  const residualStringArgs = []; // AST nodes to keep in a className
  let residualClassnamesArgs = null; // rebuilt classnames args (or null)
  let classNameAttr = null;
  let classesAttr = null;

  (openingElement.attributes || []).forEach(attr => {
    if (attr.type !== 'JSXAttribute' || !attr.name) return;
    const attrName = attr.name.name;

    if (attrName === 'className' && attr.value && attr.value.type === 'JSXExpressionContainer') {
      classNameAttr = attr;
      const expr = attr.value.expression;
      analyzeClassNameExpr(expr, classesVar, classnamesLocals, {
        simpleClasses, conditionals, residualStringArgs,
        setResidualCall: (args) => { residualClassnamesArgs = args; },
      });
    } else if (attrName === 'classes' && attr.value && attr.value.type === 'JSXExpressionContainer') {
      const expr = attr.value.expression;
      if (expr.type === 'ObjectExpression') {
        classesAttr = attr;
        expr.properties.forEach(prop => {
          if (!prop.key) return;
          const slot = prop.key.name || prop.key.value;
          const keys = [];
          const v = prop.value;
          const single = classKeyFromMember(v, classesVar);
          if (single) {
            keys.push(single);
          } else if (v && v.type === 'TemplateLiteral') {
            v.expressions.forEach(e => {
              const k = classKeyFromMember(e, classesVar);
              if (k) keys.push(k);
            });
          }
          if (keys.length) slotClasses.push({ slot, classKeys: keys });
        });
      }
    }
  });

  if (!simpleClasses.length && !slotClasses.length && !conditionals.length) {
    return null;
  }

  // Derive prop names for conditionals (identifier cond → its name, else classKey).
  conditionals.forEach(c => {
    if (c.cond && c.cond.type === 'Identifier') {
      c.propName = c.cond.name;
    } else {
      c.propName = c.classKey;
    }
  });

  return {
    simpleClasses,
    slotClasses,
    conditionals,
    residualStringArgs,
    residualClassnamesArgs,
    classNameAttr,
    classesAttr,
  };
}

/**
 * Parses a className expression, populating simpleClasses / conditionals /
 * residual string args.
 */
function analyzeClassNameExpr(expr, classesVar, classnamesLocals, out) {
  if (!expr) return;

  // className={classes.x}
  const single = classKeyFromMember(expr, classesVar);
  if (single) {
    out.simpleClasses.push(single);
    return;
  }

  // className={classnames(...)} / clsx(...)
  if (expr.type === 'CallExpression' && expr.callee.type === 'Identifier' &&
      classnamesLocals.has(expr.callee.name)) {
    const remaining = [];
    expr.arguments.forEach(arg => {
      const k = classKeyFromMember(arg, classesVar);
      if (k) { out.simpleClasses.push(k); return; }

      if (arg.type === 'ObjectExpression') {
        const keptProps = [];
        arg.properties.forEach(p => {
          // { [classes.x]: cond }
          if (p.computed && p.key) {
            const ck = classKeyFromMember(p.key, classesVar);
            if (ck) { out.conditionals.push({ classKey: ck, cond: p.value }); return; }
          }
          keptProps.push(p);
        });
        if (keptProps.length) remaining.push({ type: 'ObjectExpression', properties: keptProps });
        return;
      }

      // cond && classes.x
      if (arg.type === 'LogicalExpression' && arg.operator === '&&') {
        const ck = classKeyFromMember(arg.right, classesVar);
        if (ck) { out.conditionals.push({ classKey: ck, cond: arg.left }); return; }
      }

      // classes.a ? ... anything else → keep as residual arg
      remaining.push(arg);
    });

    if (remaining.length === 1 && remaining[0].type === 'Literal') {
      out.residualStringArgs.push(remaining[0]);
    } else if (remaining.length) {
      out.setResidualCall(remaining);
    }
    return;
  }

  // className={`${classes.a} static ${classes.b}`}
  if (expr.type === 'TemplateLiteral') {
    expr.expressions.forEach(e => {
      const k = classKeyFromMember(e, classesVar);
      if (k) { out.simpleClasses.push(k); return; }
      if (e.type === 'LogicalExpression' && e.operator === '&&') {
        const ck = classKeyFromMember(e.right, classesVar);
        if (ck) { out.conditionals.push({ classKey: ck, cond: e.left }); return; }
      }
    });
    // Preserve any non-empty static class tokens as a residual string.
    const staticTokens = expr.quasis
      .map(q => (q.value && q.value.cooked ? q.value.cooked : '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (staticTokens) {
      out.residualStringArgs.push({ type: 'Literal', value: staticTokens });
    }
  }
}

// -------------------------------------------------------- styled component build

/**
 * Builds the style ObjectExpression body for a styled component from analysis.
 * Order: top-level props, conditional spreads, selector props.
 */
function buildStyleObject(j, analysis, base, styleMap, themeParam) {
  const topLevel = [];
  const spreads = [];
  const selectors = [];
  let componentUsesTheme = false;
  const propNames = [];

  const materialize = (classKey) => {
    const value = styleMap.get(classKey);
    if (!value) return null;
    if (usesTheme(j, value)) componentUsesTheme = true;
    let cloned = cloneNode(value);
    if (themeParam && themeParam !== 'theme') {
      renameIdentifier(cloned, themeParam, 'theme');
    }
    return cloned;
  };

  const pushTopLevelFrom = (cloned) => {
    if (cloned && cloned.type === 'ObjectExpression') {
      cloned.properties.forEach(p => topLevel.push(p));
    }
  };

  // 1. simple (unconditional) classes → top-level.
  analysis.simpleClasses.forEach(ck => pushTopLevelFrom(materialize(ck)));

  // 2. slot classes.
  analysis.slotClasses.forEach(({ slot, classKeys }) => {
    // Merge (rare) multiple class refs for one slot into one object.
    const merged = j.objectExpression([]);
    classKeys.forEach(ck => {
      const cloned = materialize(ck);
      if (cloned && cloned.type === 'ObjectExpression') {
        cloned.properties.forEach(p => merged.properties.push(p));
      }
    });
    const selector = slotToSelector(slot, base);
    if (selector === null) {
      merged.properties.forEach(p => topLevel.push(p));
    } else {
      selectors.push(buildSelectorProperty(j, selector, merged));
    }
  });

  // 3. conditional classes → `...(prop && { ... })` spreads.
  analysis.conditionals.forEach(({ classKey, propName }) => {
    const cloned = materialize(classKey);
    if (!cloned || cloned.type !== 'ObjectExpression') return;
    if (!propNames.includes(propName)) propNames.push(propName);
    const logical = j.logicalExpression('&&', j.identifier(propName), cloned);
    spreads.push(buildObjectSpread(j, logical));
  });

  const properties = [...topLevel, ...spreads, ...selectors];
  const styleObjectExpr = j.objectExpression(properties);

  return { styleObjectExpr, componentUsesTheme, propNames };
}

/**
 * Builds a `styled(Base)(...)` / `styled(Base, { shouldForwardProp })(...)` call.
 * `base` is the identifier as it appears in scope (local import name for MUI).
 */
function buildStyledCall(j, base, isComponent, styleObjectExpr, componentUsesTheme, propNames) {
  const baseArg = isComponent ? j.identifier(base) : j.literal(base);

  // styled(Base) or styled(Base, { shouldForwardProp })
  let styledCalleeArgs = [baseArg];
  if (propNames.length) {
    const chain = propNames
      .map(p => j.binaryExpression('!==', j.identifier('prop'), j.literal(p)));
    let guard = chain[0];
    for (let i = 1; i < chain.length; i++) {
      guard = j.logicalExpression('&&', guard, chain[i]);
    }
    const shouldForwardProp = j.arrowFunctionExpression([j.identifier('prop')], guard);
    const optionsObj = j.objectExpression([
      j.property('init', j.identifier('shouldForwardProp'), shouldForwardProp),
    ]);
    styledCalleeArgs = [baseArg, optionsObj];
  }

  const styledCallee = j.callExpression(j.identifier('styled'), styledCalleeArgs);

  // Argument: object form, or ({ theme?, ...props }) => ({ ... }).
  let styleArg;
  const paramProps = [];
  if (componentUsesTheme) {
    const themeProp = j.property('init', j.identifier('theme'), j.identifier('theme'));
    themeProp.shorthand = true;
    paramProps.push(themeProp);
  }
  propNames.forEach(p => {
    const pp = j.property('init', j.identifier(p), j.identifier(p));
    pp.shorthand = true;
    paramProps.push(pp);
  });

  if (paramProps.length) {
    styleArg = j.arrowFunctionExpression([j.objectPattern(paramProps)], styleObjectExpr);
  } else {
    styleArg = styleObjectExpr;
  }

  return j.callExpression(styledCallee, [styleArg]);
}

/**
 * Builds a `const Name = styled(Base)(...)` declaration.
 */
function buildStyledDeclaration(j, name, base, isComponent, styleObjectExpr, componentUsesTheme, propNames) {
  const styledCall = buildStyledCall(j, base, isComponent, styleObjectExpr, componentUsesTheme, propNames);
  return j.variableDeclaration('const', [j.variableDeclarator(j.identifier(name), styledCall)]);
}

// ----------------------------------------------------------------- JSX rewrite

/**
 * Rewrites a JSX element: rename tag, strip consumed className/classes, add props.
 */
function rewriteElement(j, elementPath, styledName, analysis) {
  const el = elementPath.node;
  const opening = el.openingElement;
  const closing = el.closingElement;

  // styledName === null → strip dead class refs only, keep the original tag.
  if (styledName) {
    opening.name = j.jsxIdentifier(styledName);
    if (closing) closing.name = j.jsxIdentifier(styledName);
  }

  // Remove the classes={{...}} attribute entirely.
  if (analysis.classesAttr) {
    opening.attributes = opening.attributes.filter(a => a !== analysis.classesAttr);
  }

  // Rebuild / remove the className attribute.
  if (analysis.classNameAttr) {
    const residualClass = buildResidualClassName(j, analysis);
    if (residualClass) {
      analysis.classNameAttr.value = residualClass;
    } else {
      opening.attributes = opening.attributes.filter(a => a !== analysis.classNameAttr);
    }
  }

  // Add boolean props for conditionals.
  const added = new Set();
  analysis.conditionals.forEach(({ propName, cond }) => {
    if (added.has(propName)) return;
    added.add(propName);
    opening.attributes.push(
      j.jsxAttribute(j.jsxIdentifier(propName), j.jsxExpressionContainer(cloneNode(cond)))
    );
  });
}

/**
 * Produces the residual className attribute value (string or classnames call),
 * or null when nothing remains.
 */
function buildResidualClassName(j, analysis) {
  const stringArgs = analysis.residualStringArgs || [];
  const callArgs = analysis.residualClassnamesArgs;

  if (callArgs && callArgs.length) {
    // Rebuild a classnames() call with the leftover args + string literals.
    const args = [...stringArgs.map(s => j.literal(s.value)), ...callArgs.map(cloneNode)];
    if (args.length === 1 && args[0].type === 'Literal') {
      return j.literal(args[0].value);
    }
    return j.jsxExpressionContainer(j.callExpression(j.identifier('classnames'), args));
  }

  if (stringArgs.length === 1) {
    return j.literal(stringArgs[0].value);
  }
  if (stringArgs.length > 1) {
    return j.literal(stringArgs.map(s => s.value).join(' '));
  }
  return null;
}

// -------------------------------------------------------------- HOC / cleanup

/**
 * Rewrites `compose(withStyles(x), rest...)(C)` and bare `withStyles(x)(C)`.
 */
function removeWithStylesHOC(j, root, withStylesLocal) {
  let composeStillUsed = false;

  // compose(withStyles(x), ...rest)(Comp)
  root.find(j.CallExpression, {
    callee: { type: 'CallExpression', callee: { type: 'Identifier', name: 'compose' } },
  }).forEach(path => {
    const composeCall = path.node.callee;
    const filtered = composeCall.arguments.filter(a => !isWithStylesCall(a, withStylesLocal));
    if (filtered.length === composeCall.arguments.length) {
      composeStillUsed = true;
      return; // no withStyles here
    }
    if (filtered.length === 0) {
      // compose(withStyles(x))(Comp) → Comp
      j(path).replaceWith(path.node.arguments[0]);
    } else if (filtered.length === 1) {
      // → onlyRemaining(Comp)
      j(path).replaceWith(
        j.callExpression(filtered[0], path.node.arguments)
      );
    } else {
      composeCall.arguments = filtered;
      composeStillUsed = true;
    }
  });

  // bare withStyles(x)(Comp) → Comp
  root.find(j.CallExpression, {
    callee: { type: 'CallExpression' },
  }).forEach(path => {
    if (isWithStylesCall(path.node.callee, withStylesLocal) && path.node.arguments.length === 1) {
      j(path).replaceWith(path.node.arguments[0]);
    }
  });

  // Drop `compose` import if no longer used.
  if (!composeStillUsed) {
    let usesCompose = false;
    root.find(j.Identifier, { name: 'compose' }).forEach(p => {
      const parent = p.parentPath.node;
      if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier') return;
      usesCompose = true;
    });
    if (!usesCompose) {
      root.find(j.ImportDeclaration).forEach(path => {
        const specs = path.node.specifiers;
        const filtered = specs.filter(s => !(s.local && s.local.name === 'compose'));
        if (filtered.length !== specs.length) {
          if (filtered.length === 0) j(path).remove();
          else path.node.specifiers = filtered;
        }
      });
    }
  }
}

function isWithStylesCall(node, withStylesLocal) {
  return node && node.type === 'CallExpression' && node.callee &&
    node.callee.type === 'Identifier' && node.callee.name === withStylesLocal;
}

/** Removes the `classes` prop from destructuring, PropTypes and child plumbing. */
function removeClassesProp(j, root, classesVar) {
  // 1. Drop `classes` from any destructuring pattern (component params,
  //    `const { classes } = this.props`, etc.).
  root.find(j.ObjectPattern).forEach(path => {
    const props = path.node.properties;
    if (!Array.isArray(props)) return;
    const filtered = props.filter(p => (p.key && (p.key.name || p.key.value)) !== classesVar);
    if (filtered.length !== props.length) {
      path.node.properties = filtered;
    }
  });

  // 2. Remove now-empty `const {} = <expr>;` declarations left behind.
  root.find(j.VariableDeclaration).forEach(path => {
    if (!Array.isArray(path.node.declarations)) return;
    const kept = path.node.declarations.filter(
      d => !(d.id && d.id.type === 'ObjectPattern' && d.id.properties.length === 0)
    );
    if (kept.length !== path.node.declarations.length) {
      if (kept.length === 0) j(path).remove();
      else path.node.declarations = kept;
    }
  });

  // 3. Remove `classes: PropTypes.<...>` from any propTypes object.
  root.find(j.ObjectExpression).forEach(objPath => {
    const props = objPath.node.properties;
    if (!Array.isArray(props)) return;
    const filtered = props.filter(pr => {
      const key = pr.key && (pr.key.name || pr.key.value);
      if (key !== classesVar) return true;
      const val = pr.value;
      const isPropType = val && val.type === 'MemberExpression' &&
        j(val).find(j.Identifier, { name: 'PropTypes' }).size() > 0;
      return !isPropType;
    });
    if (filtered.length !== props.length) {
      objPath.node.properties = filtered;
    }
  });

  // 4. Remove `classes={classes}` / `classes={{}}` plumbed to child elements.
  root.find(j.JSXOpeningElement).forEach(opPath => {
    const attrs = opPath.node.attributes;
    if (!Array.isArray(attrs)) return;
    opPath.node.attributes = attrs.filter(a => {
      if (a.type !== 'JSXAttribute' || !a.name || a.name.name !== 'classes') return true;
      const v = a.value;
      if (v && v.type === 'JSXExpressionContainer') {
        const e = v.expression;
        if ((e.type === 'Identifier' && e.name === classesVar) ||
            (e.type === 'ObjectExpression' && e.properties.length === 0)) {
          return false;
        }
      }
      return true;
    });
  });
}

/** Removes a variable declarator by name if it is no longer referenced. */
function removeIfUnused(j, root, name) {
  let uses = 0;
  root.find(j.Identifier, { name }).forEach(p => {
    const parent = p.parentPath.node;
    if (parent.type === 'VariableDeclarator' && parent.id === p.node) return;
    if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier') return;
    if ((parent.type === 'Property' || parent.type === 'ObjectProperty') && parent.key === p.node && !parent.computed) return;
    // `foo.styles` / `foo?.styles` — a property access on another object, not a use.
    if ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') &&
        parent.property === p.node && !parent.computed) return;
    uses++;
  });
  if (uses > 0) return;
  root.find(j.VariableDeclaration).forEach(path => {
    const decls = path.node.declarations;
    if (!Array.isArray(decls)) return;
    const filtered = decls.filter(d => !(d.id && d.id.type === 'Identifier' && d.id.name === name));
    if (filtered.length !== decls.length) {
      if (filtered.length === 0) j(path).remove();
      else path.node.declarations = filtered;
    }
  });
}

/** Removes a relative `import X from './...styles'` if X is no longer used. */
function removeUnusedStyleImports(j, root) {
  root.find(j.ImportDeclaration).forEach(path => {
    const source = path.node.source.value;
    // Only local style-object modules — never the '@mui/material/styles' styled import.
    if (!source.startsWith('.') || !/styles?$/i.test(source)) return;
    const specs = path.node.specifiers;
    const kept = specs.filter(spec => {
      if (!spec.local) return true;
      const local = spec.local.name;
      let uses = 0;
      root.find(j.Identifier, { name: local }).forEach(p => {
        const parent = p.parentPath.node;
        if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier') return;
        uses++;
      });
      return uses > 0;
    });
    if (kept.length !== specs.length) {
      if (kept.length === 0) j(path).remove();
      else path.node.specifiers = kept;
    }
  });
}

// ------------------------------------------------------------- output format

/**
 * Cleans up recast's reprinting artifacts on freshly-built nodes:
 *   - collapses multi-line arrow object-pattern params to `({ a, b }) =>`
 *   - drops blank lines injected inside object/argument literals
 * Leaves blank lines between top-level statements intact.
 */
function formatOutput(src) {
  // Collapse multi-line parenthesized destructuring params to one line, e.g.
  //   `( {\n a,\n b,\n } ) =>`      → `({ a, b }) =>`
  //   `function f( {\n a,\n } ) {`  → `function f({ a }) {`
  // Guarded to pure identifier-list patterns (never object literals with values).
  src = src.replace(/\(\s*\{\s*([^{}]*?)\s*\}\s*,?\s*\)(\s*)(=>|\{)/g, (match, inner, _ws, tail) => {
    if (!/^[\w$\s,]*$/.test(inner)) return match; // has `:` / values → real object, skip
    const props = inner.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const inside = props.length ? `{ ${props.join(', ')} }` : '{}';
    return tail === '=>' ? `(${inside}) =>` : `(${inside}) {`;
  });

  // Drop blank lines that sit immediately inside an opened structure.
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      const prev = out.length ? out[out.length - 1].trimEnd() : '';
      let k = i + 1;
      while (k < lines.length && lines[k].trim() === '') k++;
      const next = k < lines.length ? lines[k].trim() : '';
      const prevOpens = /[{([,]$/.test(prev);
      const nextIsMember = /^[}\])]/.test(next) || /^['"`]/.test(next) ||
        /^\.\.\./.test(next) || /^&/.test(next) || /^[\w$]+\s*:/.test(next) ||
        /^\[/.test(next);
      if (prevOpens && nextIsMember) continue;
      // Collapse runs of blank lines to a single blank line.
      if (out.length && out[out.length - 1].trim() === '') continue;
    }
    out.push(lines[i]);
  }
  // Trim trailing blank lines to a single terminating newline.
  while (out.length > 1 && out[out.length - 1].trim() === '') out.pop();
  return out.join('\n');
}

// -------------------------------------------------------------------- main

function transformer(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  const namedImports = findJSSImports(j, root);
  const defaultImports = findDefaultJSSImports(j, root);
  const allJSSImports = [...namedImports, ...defaultImports];
  if (allJSSImports.length === 0) return fileInfo.source;

  const makeStylesImport = allJSSImports.find(i => i.importName === 'makeStyles');
  const withStylesImport = allJSSImports.find(i => i.importName === 'withStyles');
  if (!makeStylesImport && !withStylesImport) return fileInfo.source;

  const externalStyles = findExternalStyleDefinitions(j, root);
  const classnamesLocals = findClassnamesLocals(j, root);
  const { importedNames, muiCanonical } = findImportedNames(j, root);
  const ctx = { filePath: fileInfo.path, imports: buildImportsMap(j, root) };
  const externalStyleNamesToCheck = new Set();

  let hasChanges = false;
  let bailComplex = false;
  const existingNames = new Set();

  // ---- Convert inline `const X = withStyles({...})(MuiComp)` styled defs ----
  // (must run before HOC removal so they are not mistaken for HOC wrappers).
  if (withStylesImport) {
    const { converted, bail } = convertInlineWithStyles(
      j, root, withStylesImport.localName, importedNames, muiCanonical, externalStyles, ctx
    );
    if (converted > 0) hasChanges = true;
    if (bail) bailComplex = true;
  }

  // ---- Gather style sources (makeStyles hooks + withStyles calls) ----
  const sources = []; // { styleMap, themeParam, classesVar }

  if (makeStylesImport) {
    const makeStylesName = makeStylesImport.localName;
    root.find(j.VariableDeclarator).forEach(path => {
      const id = path.node.id;
      const init = path.node.init;
      if (id.type !== 'Identifier' || !init || init.type !== 'CallExpression') return;
      if (init.callee.type === 'Identifier' && init.callee.name === makeStylesName) {
        const hookName = id.name;
        const { styleObject, themeParam } = resolveStyles(j, root, init.arguments[0], externalStyles, ctx);
        if (!styleObject) return;
        if (hasFunctionValuedStyleProp(styleObject)) { bailComplex = true; return; }

        // classes var = name assigned from useStyles()
        let classesVar = 'classes';
        root.find(j.VariableDeclarator).forEach(vp => {
          const vinit = vp.node.init;
          if (vp.node.id.type === 'Identifier' && vinit && vinit.type === 'CallExpression' &&
              vinit.callee.type === 'Identifier' && vinit.callee.name === hookName) {
            classesVar = vp.node.id.name;
          }
        });
        if (init.arguments[0] && init.arguments[0].type === 'Identifier') {
          externalStyleNamesToCheck.add(init.arguments[0].name);
        }
        sources.push({ styleMap: buildStyleMap(styleObject), themeParam, classesVar, hookName });
      }
    });
  }

  if (withStylesImport) {
    const withStylesName = withStylesImport.localName;
    root.find(j.CallExpression).forEach(path => {
      if (!isWithStylesCall(path.node, withStylesName)) return;
      const { styleObject, themeParam } = resolveStyles(j, root, path.node.arguments[0], externalStyles, ctx);
      if (!styleObject) return;
      if (hasFunctionValuedStyleProp(styleObject)) { bailComplex = true; return; }
      if (path.node.arguments[0] && path.node.arguments[0].type === 'Identifier') {
        externalStyleNamesToCheck.add(path.node.arguments[0].name);
      }
      sources.push({ styleMap: buildStyleMap(styleObject), themeParam, classesVar: 'classes', withStyles: true });
    });
  }

  // Dynamic per-class function styles need manual work — leave the whole file
  // untouched rather than risk dropping styles.
  if (bailComplex) return fileInfo.source;

  if (sources.length === 0 && !hasChanges) return fileInfo.source;

  // Merge all style maps (usually one source per file).
  const styleMap = new Map();
  let themeParam = null;
  const classesVars = new Set();
  sources.forEach(s => {
    s.styleMap.forEach((v, k) => { if (!styleMap.has(k)) styleMap.set(k, v); });
    if (s.themeParam) themeParam = s.themeParam;
    classesVars.add(s.classesVar);
  });

  // ---- Collect target elements ----
  const targets = []; // { path, analysis, base, isComponent, name }

  root.find(j.JSXElement).forEach(path => {
    const opening = path.node.openingElement;
    if (!opening || !opening.name) return;
    if (opening.name.type !== 'JSXIdentifier') return; // skip member-expression tags

    // Try each candidate classes var (usually just one).
    let analysis = null;
    for (const cv of classesVars) {
      const a = analyzeElement(j, opening, cv, classnamesLocals);
      if (a) { analysis = a; break; }
    }
    if (!analysis) return;

    const tag = opening.name.name;
    const isComponent = isUpperFirst(tag);
    targets.push({ path, analysis, base: tag, isComponent });
  });

  if (targets.length === 0) {
    // No JSX usage found; still strip the JSS scaffolding below.
  }

  // ---- Build styled declarations ----
  const declarations = [];
  const liveTargets = [];
  const deadStripTargets = [];
  targets.forEach(t => {
    // Canonical MUI name (alias-resolved) drives naming + slot selectors; the
    // local tag drives the styled(...) argument identifier.
    const canonicalBase = t.isComponent ? (muiCanonical.get(t.base) || t.base) : t.base;

    const { styleObjectExpr, componentUsesTheme, propNames } =
      buildStyleObject(j, t.analysis, canonicalBase, styleMap, themeParam);

    // Element whose classes all resolved to nothing. Since `classesVars` are
    // backed by fully-resolved in-file style sources, these are DEAD references
    // (class never defined) → strip the dead className/classes attrs but keep
    // the original tag (no styled component created).
    if (styleObjectExpr.properties.length === 0 && propNames.length === 0) {
      deadStripTargets.push(t);
      return;
    }

    const primaryClassKey =
      (t.analysis.slotClasses.find(s => s.slot === 'root') || {}).classKeys?.[0] ||
      t.analysis.simpleClasses[0] ||
      (t.analysis.slotClasses[0] || {}).classKeys?.[0] ||
      (t.analysis.conditionals[0] || {}).classKey;

    const name = deriveStyledComponentName({
      base: canonicalBase,
      isComponent: t.isComponent,
      primaryClassKey,
      existingNames,
    });
    t.name = name;

    declarations.push(
      buildStyledDeclaration(j, name, t.base, t.isComponent, styleObjectExpr, componentUsesTheme, propNames)
    );
    liveTargets.push(t);
    hasChanges = true;
  });

  // ---- Rewrite JSX ----
  liveTargets.forEach(t => rewriteElement(j, t.path, t.name, t.analysis));
  deadStripTargets.forEach(t => {
    rewriteElement(j, t.path, null, t.analysis);
    hasChanges = true;
  });

  // ---- Insert styled declarations after imports ----
  if (declarations.length) {
    const program = root.get().node.program;
    let insertIndex = program.body.findIndex(n => n.type !== 'ImportDeclaration');
    if (insertIndex === -1) insertIndex = program.body.length;
    declarations.forEach((decl, i) => program.body.splice(insertIndex + i, 0, decl));
  }

  // ---- Remove makeStyles hook + useStyles() call declarations ----
  if (makeStylesImport) {
    const makeStylesName = makeStylesImport.localName;
    // remove `const useStyles = makeStyles(...)` and `const classes = makeStyles(...)()`
    root.find(j.VariableDeclaration).forEach(path => {
      const kept = path.node.declarations.filter(d => {
        const init = d.init;
        if (!init) return true;
        // useStyles = makeStyles(...)
        if (init.type === 'CallExpression' && init.callee.type === 'Identifier' &&
            init.callee.name === makeStylesName) return false;
        // classes = makeStyles(...)()
        if (init.type === 'CallExpression' && init.callee.type === 'CallExpression' &&
            init.callee.callee.type === 'Identifier' && init.callee.callee.name === makeStylesName) return false;
        return true;
      });
      if (kept.length !== path.node.declarations.length) {
        hasChanges = true;
        if (kept.length === 0) j(path).remove();
        else path.node.declarations = kept;
      }
    });
    // remove `const classes = useStyles()` for each hook
    sources.forEach(s => {
      if (!s.hookName) return;
      root.find(j.VariableDeclaration).forEach(path => {
        const kept = path.node.declarations.filter(d => {
          const init = d.init;
          return !(init && init.type === 'CallExpression' && init.callee.type === 'Identifier' &&
            init.callee.name === s.hookName);
        });
        if (kept.length !== path.node.declarations.length) {
          if (kept.length === 0) j(path).remove();
          else path.node.declarations = kept;
        }
      });
    });
  }

  // Are any `classes.x` references still unresolved (e.g. cross-file styles)?
  // If so, keep the `classes` prop / HOC that provides them.
  let classesStillUsed = false;
  classesVars.forEach(cv => {
    root.find(j.MemberExpression, { object: { type: 'Identifier', name: cv } }).forEach(() => {
      classesStillUsed = true;
    });
  });

  // ---- Remove withStyles HOC wrapping (only if classes fully migrated) ----
  if (withStylesImport && !classesStillUsed) {
    removeWithStylesHOC(j, root, withStylesImport.localName);
    hasChanges = true;
  }

  // Remove the `classes` prop plumbing (destructuring / PropTypes / children).
  if (!classesStillUsed) {
    classesVars.forEach(cv => removeClassesProp(j, root, cv));
  }

  // ---- Drop now-unused external style objects ----
  externalStyleNamesToCheck.forEach(name => removeIfUnused(j, root, name));
  externalStyles.forEach((_def, name) => removeIfUnused(j, root, name));

  if (!hasChanges) return fileInfo.source;

  // ---- Imports: remove only JSS imports that are now unreferenced ----
  const unusedJSSImports = allJSSImports.filter(imp => {
    let used = 0;
    root.find(j.Identifier, { name: imp.localName }).forEach(p => {
      const parent = p.parentPath.node;
      if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier') return;
      used++;
    });
    return used === 0;
  });
  removeJSSImports(j, root, unusedJSSImports);
  addStyledImport(j, root);
  removeUnusedStyleImports(j, root);

  // Remove classnames / clsx imports that are no longer referenced.
  classnamesLocals.forEach(local => {
    let used = 0;
    root.find(j.Identifier, { name: local }).forEach(p => {
      const parent = p.parentPath.node;
      if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier') return;
      used++;
    });
    if (used > 0) return;
    root.find(j.ImportDeclaration).forEach(path => {
      const specs = path.node.specifiers || [];
      const kept = specs.filter(s => !(s.local && s.local.name === local));
      if (kept.length !== specs.length) {
        if (kept.length === 0) j(path).remove();
        else path.node.specifiers = kept;
      }
    });
  });

  return formatOutput(root.toSource({ quote: 'single', trailingComma: true }));
}

module.exports = transformer;
module.exports.parser = 'babel';
module.exports.formatOutput = formatOutput;

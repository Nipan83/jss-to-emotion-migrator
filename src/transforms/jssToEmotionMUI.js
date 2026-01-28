/**
 * MUI-recommended JSS to Emotion transformer
 *
 * Uses the PREFIX pattern recommended by MUI migration guide:
 * - Creates a single Root styled component with nested selectors
 * - Maintains the classes object for backward compatibility
 * - Handles MUI's classes prop pattern
 *
 * Example output:
 * const PREFIX = 'ComponentName';
 * const classes = {
 *   root: `${PREFIX}-root`,
 *   title: `${PREFIX}-title`
 * };
 * const Root = styled('div')(({ theme }) => ({
 *   [`&.${classes.root}`]: { ... },
 *   [`& .${classes.title}`]: { ... }
 * }));
 */

const {
  findJSSImports,
  findDefaultJSSImports,
  removeJSSImports,
  addStyledImport,
  extractStyleObjectFromMakeStyles,
  usesTheme,
} = require('../utils');

/**
 * Infers component name from file path or finds it in the code
 */
function inferComponentName(j, root, filePath) {
  // Try to find component name from export default
  let componentName = null;

  root.find(j.ExportDefaultDeclaration).forEach(path => {
    const decl = path.node.declaration;
    if (decl.type === 'Identifier') {
      componentName = decl.name;
    } else if (decl.type === 'FunctionDeclaration' && decl.id) {
      componentName = decl.id.name;
    }
  });

  // Fallback to function declarations
  if (!componentName) {
    root.find(j.FunctionDeclaration).forEach(path => {
      if (path.node.id && path.node.id.name) {
        const name = path.node.id.name;
        // Skip utility functions, use first component-like name
        if (name[0] === name[0].toUpperCase() && !componentName) {
          componentName = name;
        }
      }
    });
  }

  // Fallback to variable declarations with arrow functions
  if (!componentName) {
    root.find(j.VariableDeclarator).forEach(path => {
      const id = path.node.id;
      const init = path.node.init;

      if (id.type === 'Identifier' && init &&
          (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
        const name = id.name;
        if (name[0] === name[0].toUpperCase() && !componentName) {
          componentName = name;
        }
      }
    });
  }

  // Fallback to filename
  if (!componentName && filePath) {
    const fileName = filePath.split('/').pop().replace(/\.(jsx?|tsx?)$/, '');
    // Convert kebab-case to PascalCase
    componentName = fileName
      .split(/[-_]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
      .replace(/Component$/, '');
  }

  return componentName || 'Component';
}

/**
 * Determines root element type based on JSX usage
 */
function inferRootElementType(j, root, classesVarName) {
  // Look for the most common element that uses classes
  const elementCounts = new Map();

  // Check className={classes.xxx}
  root.find(j.JSXAttribute, {
    name: { name: 'className' }
  }).forEach(attrPath => {
    const value = attrPath.node.value;
    if (value && value.type === 'JSXExpressionContainer') {
      const expr = value.expression;
      if (expr && expr.type === 'MemberExpression' &&
          expr.object && expr.object.name === classesVarName) {

        // Find parent JSX element
        let path = attrPath;
        for (let i = 0; i < 5 && path; i++) {
          path = path.parentPath;
          if (path && path.node && path.node.type === 'JSXElement') {
            const name = path.node.openingElement.name.name;
            if (name && name[0] === name[0].toLowerCase()) {
              elementCounts.set(name, (elementCounts.get(name) || 0) + 1);
            }
            break;
          }
        }
      }
    }
  });

  // Check classes={{ key: classes.value }}
  root.find(j.JSXAttribute, {
    name: { name: 'classes' }
  }).forEach(attrPath => {
    let path = attrPath;
    for (let i = 0; i < 5 && path; i++) {
      path = path.parentPath;
      if (path && path.node && path.node.type === 'JSXElement') {
        const name = path.node.openingElement.name.name;
        // For MUI components, we typically use 'div' as root
        if (name && name[0] === name[0].toUpperCase()) {
          elementCounts.set('div', (elementCounts.get('div') || 0) + 1);
        }
        break;
      }
    }
  });

  // Return most common element, default to 'div'
  let maxCount = 0;
  let rootElement = 'div';
  elementCounts.forEach((count, element) => {
    if (count > maxCount) {
      maxCount = count;
      rootElement = element;
    }
  });

  return rootElement;
}

/**
 * Creates the PREFIX constant, classes object, and Root styled component
 */
function createMUIStyledComponents(j, componentName, styleObject, hasTheme, themeParam, rootElement) {
  const nodes = [];

  // 1. Create PREFIX constant
  const prefixDecl = j.variableDeclaration('const', [
    j.variableDeclarator(
      j.identifier('PREFIX'),
      j.literal(componentName)
    )
  ]);
  nodes.push(prefixDecl);

  // 2. Create classes object
  const classesProps = styleObject.properties.map(prop => {
    const key = prop.key.name || prop.key.value;
    return j.property(
      'init',
      j.identifier(key),
      j.templateLiteral(
        [
          j.templateElement({ raw: '', cooked: '' }, false),
          j.templateElement({ raw: `-${key}`, cooked: `-${key}` }, true)
        ],
        [j.identifier('PREFIX')]
      )
    );
  });

  const classesDecl = j.variableDeclaration('const', [
    j.variableDeclarator(
      j.identifier('classes'),
      j.objectExpression(classesProps)
    )
  ]);
  nodes.push(classesDecl);

  // 3. Create Root styled component with nested selectors
  const styleProps = styleObject.properties.map(prop => {
    const key = prop.key.name || prop.key.value;
    const value = prop.value;

    // Create selector: &.${classes.root} for root, & .${classes.key} for others
    const isRoot = key === 'root';
    const selectorTemplate = isRoot
      ? j.templateLiteral(
          [
            j.templateElement({ raw: '&.', cooked: '&.' }, false),
            j.templateElement({ raw: '', cooked: '' }, true)
          ],
          [j.memberExpression(j.identifier('classes'), j.identifier(key))]
        )
      : j.templateLiteral(
          [
            j.templateElement({ raw: '& .', cooked: '& .' }, false),
            j.templateElement({ raw: '', cooked: '' }, true)
          ],
          [j.memberExpression(j.identifier('classes'), j.identifier(key))]
        );

    // Mark as computed property so jscodeshift outputs [templateLiteral]: value
    const property = j.property('init', selectorTemplate, value);
    property.computed = true;
    return property;
  });

  const rootStyleObject = j.objectExpression(styleProps);

  // Determine if it's HTML element or MUI component
  const isHtmlElement = rootElement[0] === rootElement[0].toLowerCase();
  const styledArg = isHtmlElement ? j.literal(rootElement) : j.identifier(rootElement);

  const styledCall = j.callExpression(
    j.identifier('styled'),
    [styledArg]
  );

  let styleArg;
  if (hasTheme) {
    const paramName = themeParam || 'theme';
    const shorthandProp = j.property('init', j.identifier(paramName), j.identifier(paramName));
    shorthandProp.shorthand = true;
    const themeParamPattern = j.objectPattern([shorthandProp]);
    styleArg = j.arrowFunctionExpression([themeParamPattern], rootStyleObject);
  } else {
    styleArg = rootStyleObject;
  }

  const styledWithStyles = j.callExpression(styledCall, [styleArg]);

  const rootDecl = j.variableDeclaration('const', [
    j.variableDeclarator(
      j.identifier('Root'),
      styledWithStyles
    )
  ]);
  nodes.push(rootDecl);

  return nodes;
}

/**
 * Finds external style definitions
 */
function findExternalStyleDefinitions(j, root) {
  const styleDefinitions = new Map();

  root.find(j.VariableDeclarator).forEach(path => {
    const id = path.node.id;
    const init = path.node.init;

    if (id.type !== 'Identifier') return;

    const name = id.name;
    if (name === 'styles' || name.endsWith('Styles') || name.endsWith('Style')) {
      if (init) {
        styleDefinitions.set(name, {
          path,
          init,
        });
      }
    }
  });

  return styleDefinitions;
}

/**
 * Resolves styles argument
 */
function resolveStylesArgument(j, root, stylesArg, externalStyles) {
  if (stylesArg.type === 'ObjectExpression') {
    return { styleObject: stylesArg, themeParam: null };
  }

  if (stylesArg.type === 'ArrowFunctionExpression' || stylesArg.type === 'FunctionExpression') {
    return extractStyleObjectFromMakeStyles(stylesArg);
  }

  if (stylesArg.type === 'Identifier') {
    const externalDef = externalStyles.get(stylesArg.name);
    if (externalDef) {
      return extractStyleObjectFromMakeStyles(externalDef.init);
    }

    let result = { styleObject: null, themeParam: null };
    root.find(j.VariableDeclarator, { id: { name: stylesArg.name } }).forEach(path => {
      if (path.node.init) {
        result = extractStyleObjectFromMakeStyles(path.node.init);
      }
    });
    return result;
  }

  if (stylesArg.type === 'CallExpression') {
    const callee = stylesArg.callee;
    if (callee.type === 'Identifier' && callee.name === 'createStyles') {
      if (stylesArg.arguments.length > 0) {
        return resolveStylesArgument(j, root, stylesArg.arguments[0], externalStyles);
      }
    }
  }

  return { styleObject: null, themeParam: null };
}

/**
 * Checks if a JSX element is already wrapped with Root
 */
function isAlreadyWrappedWithRoot(jsxElement) {
  if (!jsxElement || jsxElement.type !== 'JSXElement') {
    return false;
  }

  const openingElement = jsxElement.openingElement;
  if (!openingElement || !openingElement.name) {
    return false;
  }

  if (openingElement.name.type === 'JSXIdentifier' && openingElement.name.name === 'Root') {
    return true;
  }

  return false;
}

/**
 * Wraps JSX element with Root component
 */
function wrapWithRoot(j, jsxElement) {
  if (!jsxElement || isAlreadyWrappedWithRoot(jsxElement)) {
    return jsxElement;
  }

  // Create <Root>...</Root> wrapper
  const rootOpeningElement = j.jsxOpeningElement(j.jsxIdentifier('Root'), []);
  const rootClosingElement = j.jsxClosingElement(j.jsxIdentifier('Root'));

  // Add a newline/text node before and after for proper formatting
  const leadingWhitespace = j.jsxText('\n      ');
  const trailingWhitespace = j.jsxText('\n    ');

  const wrapped = j.jsxElement(
    rootOpeningElement,
    rootClosingElement,
    [leadingWhitespace, jsxElement, trailingWhitespace]
  );

  return wrapped;
}

/**
 * Wraps component return statements with Root component
 */
function wrapComponentReturnsWithRoot(j, root, classesVarName) {
  // Find all function declarations and expressions that could be components
  const componentFunctions = [];

  // Find function declarations (function MyComponent() {})
  root.find(j.FunctionDeclaration).forEach(path => {
    const name = path.node.id?.name;
    if (name && name[0] === name[0].toUpperCase()) {
      componentFunctions.push(path);
    }
  });

  // Find variable declarations with arrow/function expressions (const MyComponent = () => {})
  root.find(j.VariableDeclarator).forEach(path => {
    const id = path.node.id;
    const init = path.node.init;

    if (id.type === 'Identifier' && init &&
        (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
      const name = id.name;
      if (name[0] === name[0].toUpperCase()) {
        componentFunctions.push(path);
      }
    }
  });

  // Find export default function
  root.find(j.ExportDefaultDeclaration).forEach(path => {
    const decl = path.node.declaration;
    if (decl.type === 'FunctionDeclaration' ||
        decl.type === 'ArrowFunctionExpression' ||
        decl.type === 'FunctionExpression') {
      componentFunctions.push(path);
    }
  });

  // For each component function, find and wrap return statements
  componentFunctions.forEach(componentPath => {
    // Check if this component uses the classes variable
    let usesClasses = false;
    j(componentPath).find(j.Identifier, { name: classesVarName }).forEach(() => {
      usesClasses = true;
    });

    if (!usesClasses) {
      return;
    }

    // Find all return statements within this component
    j(componentPath).find(j.ReturnStatement).forEach(returnPath => {
      let argument = returnPath.node.argument;

      // Skip empty returns
      if (!argument) {
        return;
      }

      // Check if we already wrapped this
      if (isAlreadyWrappedWithRoot(argument)) {
        return;
      }

      // Wrap JSX elements
      if (argument.type === 'JSXElement') {
        const wrapped = wrapWithRoot(j, argument);
        // Clear any parenthesization metadata
        delete wrapped.extra;
        delete argument.extra;
        returnPath.node.argument = wrapped;
        return;
      }

      // Handle JSXFragment - wrap with Root
      if (argument.type === 'JSXFragment') {
        const rootOpeningElement = j.jsxOpeningElement(j.jsxIdentifier('Root'), []);
        const rootClosingElement = j.jsxClosingElement(j.jsxIdentifier('Root'));

        const wrapped = j.jsxElement(
          rootOpeningElement,
          rootClosingElement,
          [argument]
        );
        delete wrapped.extra;
        delete argument.extra;
        returnPath.node.argument = wrapped;
        return;
      }

      // Handle conditional expressions - condition ? jsx1 : jsx2
      if (argument.type === 'ConditionalExpression') {
        if (argument.consequent.type === 'JSXElement' && !isAlreadyWrappedWithRoot(argument.consequent)) {
          const wrapped = wrapWithRoot(j, argument.consequent);
          delete wrapped.extra;
          delete argument.consequent.extra;
          argument.consequent = wrapped;
        }
        if (argument.alternate.type === 'JSXElement' && !isAlreadyWrappedWithRoot(argument.alternate)) {
          const wrapped = wrapWithRoot(j, argument.alternate);
          delete wrapped.extra;
          delete argument.alternate.extra;
          argument.alternate = wrapped;
        }
        return;
      }

      // Handle logical expressions - condition && jsx
      if (argument.type === 'LogicalExpression') {
        if (argument.right.type === 'JSXElement' && !isAlreadyWrappedWithRoot(argument.right)) {
          const wrapped = wrapWithRoot(j, argument.right);
          delete wrapped.extra;
          delete argument.right.extra;
          argument.right = wrapped;
        }
        return;
      }
    });
  });
}

/**
 * Main transformer
 */
function transformer(fileInfo, api, options = {}) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // Find JSS imports
  const namedImports = findJSSImports(j, root);
  const defaultImports = findDefaultJSSImports(j, root);
  const allJSSImports = [...namedImports, ...defaultImports];

  if (allJSSImports.length === 0) {
    return fileInfo.source;
  }

  const makeStylesImport = allJSSImports.find(imp => imp.importName === 'makeStyles');
  if (!makeStylesImport) {
    return fileInfo.source;
  }

  const externalStyles = findExternalStyleDefinitions(j, root);
  const makeStylesName = makeStylesImport.localName;

  let hasChanges = false;

  // Find makeStyles calls
  root.find(j.VariableDeclarator).forEach(path => {
    const id = path.node.id;
    const init = path.node.init;

    if (id.type !== 'Identifier') return;

    if (init && init.type === 'CallExpression') {
      const callee = init.callee;
      if (callee.type === 'Identifier' && callee.name === makeStylesName) {
        const hookName = id.name;
        const argument = init.arguments[0];

        if (!argument) return;

        const { styleObject, themeParam } = resolveStylesArgument(j, root, argument, externalStyles);

        if (!styleObject || styleObject.type !== 'ObjectExpression') {
          console.warn(`Could not extract styles from ${hookName}`);
          return;
        }

        // Infer component name
        const componentName = inferComponentName(j, root, fileInfo.path);

        // Find classes variable name
        let classesVarName = 'classes';
        root.find(j.VariableDeclarator).forEach(varPath => {
          const varId = varPath.node.id;
          const varInit = varPath.node.init;

          if (varId.type !== 'Identifier') return;

          if (varInit && varInit.type === 'CallExpression') {
            if (varInit.callee.type === 'Identifier' && varInit.callee.name === hookName) {
              classesVarName = varId.name;
            }
          }
        });

        // Infer root element type
        const rootElement = inferRootElementType(j, root, classesVarName);

        // Check if theme is used
        const styleUsesTheme = usesTheme(j, styleObject);

        // Create MUI-style components
        const styledComponents = createMUIStyledComponents(
          j,
          componentName,
          styleObject,
          styleUsesTheme,
          themeParam,
          rootElement
        );

        // Insert after imports
        const program = root.get().node.program;
        const importEndIndex = program.body.findIndex(
          node => node.type !== 'ImportDeclaration'
        );

        styledComponents.forEach((comp, idx) => {
          program.body.splice(importEndIndex + idx, 0, comp);
        });

        // Remove makeStyles definition
        root.find(j.VariableDeclaration).forEach(varDeclPath => {
          const declarations = varDeclPath.node.declarations;
          const filtered = declarations.filter(decl => {
            if (decl.id.type === 'Identifier' && decl.id.name === hookName) {
              return false;
            }
            return true;
          });

          if (filtered.length === 0) {
            j(varDeclPath).remove();
          } else if (filtered.length !== declarations.length) {
            varDeclPath.node.declarations = filtered;
          }
        });

        // Remove useStyles() call - keep the classes variable
        // The classes variable now refers to the static classes object we created
        root.find(j.VariableDeclaration).forEach(varPath => {
          const declarations = varPath.node.declarations;
          const filtered = declarations.filter(decl => {
            if (decl.init && decl.init.type === 'CallExpression') {
              const callee = decl.init.callee;
              if (callee && callee.type === 'Identifier' && callee.name === hookName) {
                return false;
              }
            }
            return true;
          });

          if (filtered.length === 0) {
            j(varPath).remove();
          } else if (filtered.length !== declarations.length) {
            varPath.node.declarations = filtered;
          }
        });

        // Clean up external styles
        externalStyles.forEach((def, name) => {
          let usageCount = 0;
          root.find(j.Identifier, { name }).forEach(idPath => {
            const isPartOfDefinition = idPath.parentPath &&
              idPath.parentPath.node &&
              idPath.parentPath.node.type === 'VariableDeclarator' &&
              idPath.parentPath.node.id &&
              idPath.parentPath.node.id.name === name;

            if (!isPartOfDefinition) {
              usageCount++;
            }
          });

          if (usageCount === 0) {
            root.find(j.VariableDeclaration).forEach(varPath => {
              const hasTargetDeclarator = varPath.node.declarations.some(decl => {
                return decl.id && decl.id.type === 'Identifier' && decl.id.name === name;
              });

              if (hasTargetDeclarator) {
                if (varPath.node.declarations.length === 1) {
                  j(varPath).remove();
                } else {
                  varPath.node.declarations = varPath.node.declarations.filter(
                    decl => !(decl.id && decl.id.type === 'Identifier' && decl.id.name === name)
                  );
                }
              }
            });
          }
        });

        // Automatically wrap component JSX returns with Root component
        wrapComponentReturnsWithRoot(j, root, classesVarName);

        hasChanges = true;
      }
    }
  });

  if (!hasChanges) {
    return fileInfo.source;
  }

  // Remove JSS imports
  removeJSSImports(j, root, allJSSImports);

  // Add styled import
  addStyledImport(j, root);

  return root.toSource({
    quote: 'single',
    trailingComma: true,
  });
}

module.exports = transformer;
module.exports.parser = 'babel';

/**
 * Main JSS to Emotion transformer
 * 
 * Handles all three JSS APIs:
 * - makeStyles
 * - withStyles
 * - createStyles
 * 
 * Also handles:
 * - External style definitions
 * - Complex className patterns (clsx, template literals)
 * - Nested styles
 * - Theme usage
 * - Props-based dynamic styles
 */

const {
  toPascalCase,
  generateUniqueComponentName,
  inferElementType,
  extractStyleObjectFromMakeStyles,
  findJSSImports,
  findDefaultJSSImports,
  removeJSSImports,
  addStyledImport,
  findClassUsages,
  findJSXElementsUsingClass,
  createClassToElementMap,
  replaceJSXElementWithStyled,
  removeUseStylesCall,
  usesTheme,
} = require('../utils');

/**
 * Creates a styled component declaration
 */
function createStyledComponent(j, componentName, elementType, styleValue, hasTheme, originalThemeParam = 'theme') {
  // For MUI components, use the component directly
  const isHtmlElement = elementType[0] === elementType[0].toLowerCase();
  const styledArg = isHtmlElement ? j.literal(elementType) : j.identifier(elementType);
  
  const styledCall = j.callExpression(
    j.identifier('styled'),
    [styledArg]
  );
  
  let styleArg;
  
  if (hasTheme) {
    // Use the original theme param name or default to 'theme'
    const paramName = originalThemeParam || 'theme';
    
    // Create shorthand property for destructuring: { theme }
    const shorthandProp = j.property('init', j.identifier(paramName), j.identifier(paramName));
    shorthandProp.shorthand = true;
    
    const themeParam = j.objectPattern([shorthandProp]);
    
    styleArg = j.arrowFunctionExpression([themeParam], styleValue);
  } else {
    styleArg = styleValue;
  }
  
  const styledWithStyles = j.callExpression(styledCall, [styleArg]);
  
  return j.variableDeclaration('const', [
    j.variableDeclarator(
      j.identifier(componentName),
      styledWithStyles
    )
  ]);
}

/**
 * Finds style definitions that are referenced by name
 */
function findExternalStyleDefinitions(j, root) {
  const styleDefinitions = new Map();

  root.find(j.VariableDeclarator).forEach(path => {
    const id = path.node.id;
    const init = path.node.init;

    // Skip if id is not an Identifier (e.g., destructuring patterns)
    if (id.type !== 'Identifier') return;

    const name = id.name;

    // Match patterns like: const styles = {...} or const xxxStyles = (theme) => ({...})
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
 * Resolves a styles argument to its actual style object
 */
function resolveStylesArgument(j, root, stylesArg, externalStyles) {
  // Direct object
  if (stylesArg.type === 'ObjectExpression') {
    return { styleObject: stylesArg, themeParam: null };
  }
  
  // Arrow function or function expression
  if (stylesArg.type === 'ArrowFunctionExpression' || stylesArg.type === 'FunctionExpression') {
    return extractStyleObjectFromMakeStyles(stylesArg);
  }
  
  // Identifier - look up external definition
  if (stylesArg.type === 'Identifier') {
    const externalDef = externalStyles.get(stylesArg.name);
    if (externalDef) {
      return extractStyleObjectFromMakeStyles(externalDef.init);
    }
    
    // Try to find it in the file
    let result = { styleObject: null, themeParam: null };
    root.find(j.VariableDeclarator, { id: { name: stylesArg.name } }).forEach(path => {
      if (path.node.init) {
        result = extractStyleObjectFromMakeStyles(path.node.init);
      }
    });
    return result;
  }
  
  // Call expression - might be createStyles
  if (stylesArg.type === 'CallExpression') {
    const callee = stylesArg.callee;
    if (callee.type === 'Identifier' && callee.name === 'createStyles') {
      // createStyles just passes through the object
      if (stylesArg.arguments.length > 0) {
        return resolveStylesArgument(j, root, stylesArg.arguments[0], externalStyles);
      }
    }
  }
  
  return { styleObject: null, themeParam: null };
}

/**
 * Process makeStyles calls
 */
function processMakeStyles(j, root, makeStylesName, externalStyles, context) {
  const makeStylesCalls = [];

  root.find(j.VariableDeclarator).forEach(path => {
    const id = path.node.id;
    const init = path.node.init;

    // Skip if id is not an Identifier (e.g., destructuring patterns)
    if (id.type !== 'Identifier') return;

    if (init && init.type === 'CallExpression') {
      const callee = init.callee;
      if (callee.type === 'Identifier' && callee.name === makeStylesName) {
        makeStylesCalls.push({
          path,
          hookName: id.name,
          argument: init.arguments[0],
        });
      }
    }
  });
  
  makeStylesCalls.forEach(({ path, hookName, argument }) => {
    if (!argument) return;
    
    const { styleObject, themeParam } = resolveStylesArgument(j, root, argument, externalStyles);
    
    if (!styleObject || styleObject.type !== 'ObjectExpression') {
      console.warn(`Could not extract styles from ${hookName}`);
      return;
    }
    
    // Find the useStyles() call
    let classesVarName = 'classes';
    root.find(j.VariableDeclarator).forEach(varPath => {
      const varId = varPath.node.id;
      const init = varPath.node.init;

      // Skip if id is not an Identifier
      if (varId.type !== 'Identifier') return;

      if (init && init.type === 'CallExpression') {
        if (init.callee.type === 'Identifier' && init.callee.name === hookName) {
          classesVarName = varId.name;
        }
      }
    });
    
    // Create element type map
    const classNames = styleObject.properties.map(prop => 
      prop.key.name || prop.key.value
    );
    const elementMap = createClassToElementMap(j, root, classesVarName, classNames);
    
    // Generate styled components
    styleObject.properties.forEach(prop => {
      const className = prop.key.name || prop.key.value;
      const styleValue = prop.value;
      const elementType = elementMap.get(className) || inferElementType(className);
      const componentName = generateUniqueComponentName(className, context.existingNames);
      
      context.classToComponentMap.set(className, componentName);
      
      const styleUsesTheme = usesTheme(j, styleValue);
      
      const styledComponent = createStyledComponent(
        j,
        componentName,
        elementType,
        styleValue,
        styleUsesTheme,
        themeParam
      );
      
      context.styledComponents.push(styledComponent);
    });
    
    // Transform JSX
    context.classToComponentMap.forEach((componentName, className) => {
      const elements = findJSXElementsUsingClass(j, root, classesVarName, className);
      
      elements.forEach(({ element }) => {
        replaceJSXElementWithStyled(j, element, componentName, classesVarName, className);
      });
    });
    
    // Remove useStyles() call
    removeUseStylesCall(j, root, hookName);
    
    // Remove makeStyles definition
    root.find(j.VariableDeclaration).forEach(varDeclPath => {
      const declarations = varDeclPath.node.declarations;
      const filtered = declarations.filter(decl => decl.id.name !== hookName);
      
      if (filtered.length === 0) {
        j(varDeclPath).remove();
      } else if (filtered.length !== declarations.length) {
        varDeclPath.node.declarations = filtered;
      }
    });
    
    context.hasChanges = true;
  });
}

/**
 * Process withStyles HOC calls
 */
function processWithStyles(j, root, withStylesName, externalStyles, context) {
  const withStylesCalls = [];
  
  root.find(j.CallExpression).forEach(path => {
    const callee = path.node.callee;
    
    if (callee.type === 'CallExpression') {
      const innerCallee = callee.callee;
      if (innerCallee.type === 'Identifier' && innerCallee.name === withStylesName) {
        withStylesCalls.push({
          path,
          stylesArg: callee.arguments[0],
          wrappedComponent: path.node.arguments[0],
        });
      }
    }
  });
  
  withStylesCalls.forEach(({ path, stylesArg, wrappedComponent }) => {
    if (!stylesArg) return;
    
    const { styleObject, themeParam } = resolveStylesArgument(j, root, stylesArg, externalStyles);
    
    if (!styleObject || styleObject.type !== 'ObjectExpression') {
      console.warn('Could not extract styles from withStyles');
      return;
    }
    
    // Generate styled components
    styleObject.properties.forEach(prop => {
      const className = prop.key.name || prop.key.value;
      const styleValue = prop.value;
      const elementType = inferElementType(className);
      const componentName = generateUniqueComponentName(className, context.existingNames);
      
      context.classToComponentMap.set(className, componentName);
      
      const styleUsesTheme = usesTheme(j, styleValue);
      
      const styledComponent = createStyledComponent(
        j,
        componentName,
        elementType,
        styleValue,
        styleUsesTheme,
        themeParam
      );
      
      context.styledComponents.push(styledComponent);
    });
    
    // Transform JSX in the wrapped component
    const classesVarName = 'classes';
    context.classToComponentMap.forEach((componentName, className) => {
      const elements = findJSXElementsUsingClass(j, root, classesVarName, className);
      
      elements.forEach(({ element }) => {
        replaceJSXElementWithStyled(j, element, componentName, classesVarName, className);
      });
    });
    
    // Remove classes from props
    if (wrappedComponent && wrappedComponent.type === 'Identifier') {
      const compName = wrappedComponent.name;
      
      // Remove from function declarations
      root.find(j.FunctionDeclaration, { id: { name: compName } }).forEach(funcPath => {
        const params = funcPath.node.params;
        if (params.length > 0 && params[0].type === 'ObjectPattern') {
          params[0].properties = params[0].properties.filter(
            prop => prop.key && prop.key.name !== 'classes'
          );
        }
      });
      
      // Remove from arrow functions
      root.find(j.VariableDeclarator, { id: { name: compName } }).forEach(varPath => {
        const init = varPath.node.init;
        if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
          const params = init.params;
          if (params.length > 0 && params[0].type === 'ObjectPattern') {
            params[0].properties = params[0].properties.filter(
              prop => prop.key && prop.key.name !== 'classes'
            );
          }
        }
      });
    }
    
    // Replace withStyles(styles)(Component) with Component
    j(path).replaceWith(wrappedComponent);
    
    context.hasChanges = true;
  });
}

/**
 * Main transformer function
 */
function transformer(fileInfo, api, options = {}) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  
  // Find all JSS imports
  const namedImports = findJSSImports(j, root);
  const defaultImports = findDefaultJSSImports(j, root);
  const allJSSImports = [...namedImports, ...defaultImports];
  
  if (allJSSImports.length === 0) {
    return fileInfo.source;
  }
  
  // Find external style definitions
  const externalStyles = findExternalStyleDefinitions(j, root);
  
  // Transformation context
  const context = {
    existingNames: new Set(),
    classToComponentMap: new Map(),
    styledComponents: [],
    hasChanges: false,
  };
  
  // Process makeStyles
  const makeStylesImport = allJSSImports.find(
    imp => imp.importName === 'makeStyles'
  );
  if (makeStylesImport) {
    processMakeStyles(j, root, makeStylesImport.localName, externalStyles, context);
  }
  
  // Process withStyles
  const withStylesImport = allJSSImports.find(
    imp => imp.importName === 'withStyles'
  );
  if (withStylesImport) {
    processWithStyles(j, root, withStylesImport.localName, externalStyles, context);
  }
  
  if (!context.hasChanges) {
    return fileInfo.source;
  }
  
  // Insert styled components after imports
  const program = root.get().node.program;
  const importEndIndex = program.body.findIndex(
    node => node.type !== 'ImportDeclaration'
  );
  
  context.styledComponents.forEach((styledComp, idx) => {
    program.body.splice(importEndIndex + idx, 0, styledComp);
  });
  
  // Clean up external style definitions that are no longer used
  // Use a safer approach: find VariableDeclarations directly
  const stylesToRemove = [];
  
  externalStyles.forEach((def, name) => {
    // Count usages (excluding the definition itself)
    let usageCount = 0;
    root.find(j.Identifier, { name }).forEach(idPath => {
      // Skip if it's part of the definition
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
      stylesToRemove.push(name);
    }
  });
  
  // Remove unused styles by finding VariableDeclarations directly
  stylesToRemove.forEach(name => {
    root.find(j.VariableDeclaration).forEach(path => {
      const hasTargetDeclarator = path.node.declarations.some(decl => {
        return decl.id && decl.id.name === name;
      });
      
      if (hasTargetDeclarator) {
        if (path.node.declarations.length === 1) {
          j(path).remove();
        } else {
          path.node.declarations = path.node.declarations.filter(
            decl => !(decl.id && decl.id.name === name)
          );
        }
      }
    });
  });
  
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

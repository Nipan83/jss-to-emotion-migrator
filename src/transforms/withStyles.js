/**
 * Transform to migrate withStyles HOC to Emotion styled components
 * 
 * Handles:
 * - withStyles(styles)(Component)
 * - withStyles((theme) => ({ ... }))(Component)
 * - export default withStyles(styles)(Component)
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
  usesTheme,
} = require('../utils');

/**
 * Creates a styled component declaration for withStyles migration
 */
function createStyledComponent(j, componentName, elementType, styleValue, hasTheme, originalThemeParam = 'theme') {
  const styledCall = j.callExpression(
    j.identifier('styled'),
    [j.literal(elementType)]
  );
  
  let styleArg;
  
  if (hasTheme) {
    const themeParam = j.objectPattern([
      j.objectProperty(
        j.identifier(originalThemeParam || 'theme'),
        j.identifier(originalThemeParam || 'theme'),
        false,
        true
      )
    ]);
    
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
 * Main transformer function
 */
function transformer(fileInfo, api, options = {}) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  
  let hasChanges = false;
  
  // Find all JSS imports
  const namedImports = findJSSImports(j, root);
  const defaultImports = findDefaultJSSImports(j, root);
  const allJSSImports = [...namedImports, ...defaultImports];
  
  // Filter for withStyles
  const withStylesImports = allJSSImports.filter(
    imp => imp.importName === 'withStyles' || imp.localName === 'withStyles'
  );
  
  if (withStylesImports.length === 0) {
    return fileInfo.source;
  }
  
  const withStylesLocalName = withStylesImports[0].localName || 'withStyles';
  
  // Find withStyles usage patterns
  // Pattern 1: export default withStyles(styles)(Component)
  // Pattern 2: const EnhancedComponent = withStyles(styles)(Component)
  
  const withStylesCalls = [];
  
  // Find CallExpression patterns: withStyles(...)(...) 
  root.find(j.CallExpression).forEach(path => {
    const callee = path.node.callee;
    
    // Check for withStyles(styles)(Component) pattern
    if (callee.type === 'CallExpression') {
      const innerCallee = callee.callee;
      if (innerCallee.type === 'Identifier' && innerCallee.name === withStylesLocalName) {
        withStylesCalls.push({
          path,
          stylesArg: callee.arguments[0], // The styles argument
          wrappedComponent: path.node.arguments[0], // The wrapped component
        });
      }
    }
  });
  
  if (withStylesCalls.length === 0) {
    return fileInfo.source;
  }
  
  // Process withStyles calls
  withStylesCalls.forEach(({ path, stylesArg, wrappedComponent }) => {
    if (!stylesArg) return;
    
    // Extract style object
    let styleObject = null;
    let themeParam = null;
    
    // Check if stylesArg is an identifier referencing external styles
    if (stylesArg.type === 'Identifier') {
      // Find the styles definition
      const stylesName = stylesArg.name;
      root.find(j.VariableDeclarator, { id: { name: stylesName } }).forEach(stylePath => {
        const init = stylePath.node.init;
        if (init) {
          const extracted = extractStyleObjectFromMakeStyles(init);
          styleObject = extracted.styleObject;
          themeParam = extracted.themeParam;
        }
      });
    } else {
      // Inline styles
      const extracted = extractStyleObjectFromMakeStyles(stylesArg);
      styleObject = extracted.styleObject;
      themeParam = extracted.themeParam;
    }
    
    if (!styleObject || styleObject.type !== 'ObjectExpression') {
      console.warn('Could not extract styles from withStyles');
      return;
    }
    
    // Get the wrapped component name
    let componentName = 'Component';
    if (wrappedComponent.type === 'Identifier') {
      componentName = wrappedComponent.name;
    }
    
    // Track generated component names
    const existingNames = new Set();
    const classToComponentMap = new Map();
    const styledComponents = [];
    
    // Create styled components for each class
    styleObject.properties.forEach(prop => {
      const className = prop.key.name || prop.key.value;
      const styleValue = prop.value;
      const elementType = inferElementType(className);
      const styledName = generateUniqueComponentName(className, existingNames);
      
      classToComponentMap.set(className, styledName);
      
      const styleUsesTheme = usesTheme(j, styleValue);
      
      const styledComponent = createStyledComponent(
        j,
        styledName,
        elementType,
        styleValue,
        styleUsesTheme,
        themeParam
      );
      
      styledComponents.push(styledComponent);
    });
    
    // Find the position to insert styled components
    const program = root.get().node.program;
    const importEndIndex = program.body.findIndex(
      node => node.type !== 'ImportDeclaration'
    );
    
    // Insert styled components after imports
    styledComponents.forEach((styledComp, idx) => {
      program.body.splice(importEndIndex + idx, 0, styledComp);
    });
    
    // Transform the component that uses withStyles
    // Find the component definition and update it to use styled components
    if (wrappedComponent.type === 'Identifier') {
      const compName = wrappedComponent.name;
      
      // Find usage of classes.xxx in the component and replace with styled components
      // This is similar to makeStyles transformation
      root.find(j.JSXAttribute, { name: { name: 'className' } }).forEach(attrPath => {
        const value = attrPath.node.value;
        if (value && value.type === 'JSXExpressionContainer') {
          const expr = value.expression;
          
          if (expr.type === 'MemberExpression' && 
              expr.object.name === 'classes') {
            const className = expr.property.name || expr.property.value;
            const styledName = classToComponentMap.get(className);
            
            if (styledName) {
              // Get the parent JSX element
              const jsxElement = attrPath.parentPath.parentPath;
              if (jsxElement && jsxElement.node.type === 'JSXElement') {
                const openingElement = jsxElement.node.openingElement;
                const closingElement = jsxElement.node.closingElement;
                
                // Change element to styled component
                openingElement.name = j.jsxIdentifier(styledName);
                if (closingElement) {
                  closingElement.name = j.jsxIdentifier(styledName);
                }
                
                // Remove className attribute
                openingElement.attributes = openingElement.attributes.filter(
                  attr => attr !== attrPath.node
                );
              }
            }
          }
        }
      });
      
      // Remove classes from component props destructuring
      root.find(j.FunctionDeclaration, { id: { name: compName } }).forEach(funcPath => {
        const params = funcPath.node.params;
        if (params.length > 0 && params[0].type === 'ObjectPattern') {
          params[0].properties = params[0].properties.filter(
            prop => prop.key.name !== 'classes'
          );
        }
      });
      
      // Also handle arrow functions
      root.find(j.VariableDeclarator, { id: { name: compName } }).forEach(varPath => {
        const init = varPath.node.init;
        if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
          const params = init.params;
          if (params.length > 0 && params[0].type === 'ObjectPattern') {
            params[0].properties = params[0].properties.filter(
              prop => prop.key.name !== 'classes'
            );
          }
        }
      });
    }
    
    // Replace withStyles(styles)(Component) with just Component
    j(path).replaceWith(wrappedComponent);
    
    hasChanges = true;
  });
  
  // Remove external styles definitions if they were only used by withStyles
  if (hasChanges) {
    // Clean up styles variable definitions that are no longer used
    root.find(j.VariableDeclarator).forEach(path => {
      const id = path.node.id;

      // Skip if id is not an Identifier (e.g., destructuring patterns)
      if (id.type !== 'Identifier') return;

      const name = id.name;
      if (name === 'styles' || name.endsWith('Styles')) {
        // Check if it's still referenced
        let usageCount = 0;
        root.find(j.Identifier, { name }).forEach(idPath => {
          if (idPath.parentPath.node !== path.node) {
            usageCount++;
          }
        });

        if (usageCount === 0) {
          // Remove the declaration
          const parent = path.parentPath;
          if (parent.node.declarations.length === 1) {
            j(parent).remove();
          } else {
            parent.node.declarations = parent.node.declarations.filter(
              d => d !== path.node
            );
          }
        }
      }
    });
    
    // Remove JSS imports
    removeJSSImports(j, root, withStylesImports);
    
    // Add styled import
    addStyledImport(j, root);
  }
  
  return root.toSource({
    quote: 'single',
    trailingComma: true,
  });
}

module.exports = transformer;
module.exports.parser = 'babel';

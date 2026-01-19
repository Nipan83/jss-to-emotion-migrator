/**
 * Transform to migrate makeStyles to Emotion styled components
 * 
 * Handles:
 * - makeStyles(() => ({ ... }))
 * - makeStyles((theme) => ({ ... }))
 * - makeStyles({ ... })
 * - External style definitions
 * - JSX transformation to use styled components
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
 * @param {object} j - jscodeshift API
 * @param {string} componentName - Name for the styled component
 * @param {string} elementType - HTML element type
 * @param {object} styleValue - Style object AST node
 * @param {boolean} hasTheme - Whether styles use theme
 * @param {string} originalThemeParam - Original theme parameter name
 * @returns {object} - Variable declaration AST node
 */
function createStyledComponent(j, componentName, elementType, styleValue, hasTheme, originalThemeParam = 'theme') {
  // styled('div')(...) or styled(Component)(...)
  const styledCall = j.callExpression(
    j.identifier('styled'),
    [j.literal(elementType)]
  );
  
  let styleArg;
  
  if (hasTheme) {
    // styled('div')(({ theme }) => ({ ... }))
    const themeParam = j.objectPattern([
      j.objectProperty(
        j.identifier('theme'),
        j.identifier('theme'),
        false,
        true // shorthand
      )
    ]);
    
    // If original theme param was different, we need to handle the style value
    let transformedStyleValue = styleValue;
    if (originalThemeParam && originalThemeParam !== 'theme') {
      // The style value references the original param name, we need to keep it consistent
      // For simplicity, we'll use the original name in destructuring
      const originalParam = j.objectPattern([
        j.objectProperty(
          j.identifier(originalThemeParam),
          j.identifier(originalThemeParam),
          false,
          true
        )
      ]);
      styleArg = j.arrowFunctionExpression(
        [originalParam],
        styleValue
      );
    } else {
      styleArg = j.arrowFunctionExpression(
        [themeParam],
        styleValue
      );
    }
  } else {
    // styled('div')({ ... })
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
 * @param {object} fileInfo - File information from jscodeshift
 * @param {object} api - jscodeshift API
 * @param {object} options - Transform options
 * @returns {string} - Transformed source code
 */
function transformer(fileInfo, api, options = {}) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  
  // Track if we made any changes
  let hasChanges = false;
  
  // Find all JSS imports (both named and default)
  const namedImports = findJSSImports(j, root);
  const defaultImports = findDefaultJSSImports(j, root);
  const allJSSImports = [...namedImports, ...defaultImports];
  
  // Filter for makeStyles only
  const makeStylesImports = allJSSImports.filter(
    imp => imp.importName === 'makeStyles' || imp.localName === 'makeStyles'
  );
  
  if (makeStylesImports.length === 0) {
    return fileInfo.source; // No makeStyles to transform
  }
  
  const makeStylesLocalName = makeStylesImports[0].localName || 'makeStyles';
  
  // Find makeStyles call and extract styles
  // Pattern: const useStyles = makeStyles(...)
  const makeStylesCalls = [];
  
  root.find(j.VariableDeclarator).forEach(path => {
    const init = path.node.init;
    if (init && init.type === 'CallExpression') {
      const callee = init.callee;
      if (callee.type === 'Identifier' && callee.name === makeStylesLocalName) {
        makeStylesCalls.push({
          path,
          hookName: path.node.id.name, // e.g., 'useStyles'
          argument: init.arguments[0], // The styles argument
        });
      }
    }
  });
  
  if (makeStylesCalls.length === 0) {
    return fileInfo.source; // No makeStyles usage found
  }
  
  // Process each makeStyles call
  makeStylesCalls.forEach(({ path, hookName, argument }) => {
    if (!argument) return;
    
    // Extract style object and theme parameter
    const { styleObject, themeParam } = extractStyleObjectFromMakeStyles(argument);
    
    if (!styleObject || styleObject.type !== 'ObjectExpression') {
      console.warn(`Could not extract styles from ${hookName}`);
      return;
    }
    
    // Find the useStyles() call and get the classes variable name
    let classesVarName = 'classes';
    root.find(j.VariableDeclarator).forEach(varPath => {
      const init = varPath.node.init;
      if (init && init.type === 'CallExpression') {
        if (init.callee.type === 'Identifier' && init.callee.name === hookName) {
          classesVarName = varPath.node.id.name;
        }
      }
    });
    
    // Create element type map from JSX usage
    const classNames = styleObject.properties.map(prop => 
      prop.key.name || prop.key.value
    );
    const elementMap = createClassToElementMap(j, root, classesVarName, classNames);
    
    // Track generated component names
    const existingNames = new Set();
    const classToComponentMap = new Map();
    
    // Create styled components for each class
    const styledComponents = [];
    
    styleObject.properties.forEach(prop => {
      const className = prop.key.name || prop.key.value;
      const styleValue = prop.value;
      const elementType = elementMap.get(className) || inferElementType(className);
      const componentName = generateUniqueComponentName(className, existingNames);
      
      classToComponentMap.set(className, componentName);
      
      // Check if this specific style uses theme
      const styleUsesTheme = usesTheme(j, styleValue);
      
      const styledComponent = createStyledComponent(
        j,
        componentName,
        elementType,
        styleValue,
        styleUsesTheme,
        themeParam
      );
      
      styledComponents.push(styledComponent);
    });
    
    // Find the position to insert styled components (after imports, before component)
    const program = root.get().node.program;
    const importEndIndex = program.body.findIndex(
      node => node.type !== 'ImportDeclaration'
    );
    
    // Insert styled components after imports
    styledComponents.forEach((styledComp, idx) => {
      program.body.splice(importEndIndex + idx, 0, styledComp);
    });
    
    // Transform JSX to use styled components
    classToComponentMap.forEach((componentName, className) => {
      const elements = findJSXElementsUsingClass(j, root, classesVarName, className);
      
      elements.forEach(({ element, attribute, isSimple }) => {
        if (isSimple) {
          replaceJSXElementWithStyled(j, element, componentName, classesVarName, className);
        } else {
          // For complex cases (template literals, clsx), we still replace
          // but may need to handle remaining classes
          replaceJSXElementWithStyled(j, element, componentName, classesVarName, className);
        }
      });
    });
    
    // Remove the useStyles() call
    removeUseStylesCall(j, root, hookName);
    
    // Remove the makeStyles definition
    // Find and remove: const useStyles = makeStyles(...)
    root.find(j.VariableDeclaration).forEach(varDeclPath => {
      const declarations = varDeclPath.node.declarations;
      const filtered = declarations.filter(decl => {
        if (decl.id.name === hookName) {
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
    
    hasChanges = true;
  });
  
  if (hasChanges) {
    // Remove JSS imports
    removeJSSImports(j, root, makeStylesImports);
    
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

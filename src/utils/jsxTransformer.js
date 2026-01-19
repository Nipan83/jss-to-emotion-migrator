/**
 * Utility functions for transforming JSX to use styled components
 */

/**
 * Finds all usages of classes.xxx in the file
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @param {string} classesVarName - The variable name (e.g., 'classes')
 * @returns {Map<string, Array>} - Map of class name to usage paths
 */
function findClassUsages(j, root, classesVarName = 'classes') {
  const usages = new Map();
  
  root.find(j.MemberExpression, {
    object: { name: classesVarName }
  }).forEach(path => {
    const className = path.node.property.name || path.node.property.value;
    if (!usages.has(className)) {
      usages.set(className, []);
    }
    usages.get(className).push(path);
  });
  
  return usages;
}

/**
 * Helper to safely get element type from a JSX path
 */
/**
 * Navigate from JSXAttribute to JSXElement following the correct path
 * Path is: JSXAttribute -> attributes array -> JSXOpeningElement -> JSXElement
 */
function findJSXElementFromAttribute(attrPath) {
  let path = attrPath;
  
  // Navigate up until we find a JSXElement
  for (let i = 0; i < 5 && path; i++) {
    path = path.parentPath;
    if (path && path.node && path.node.type === 'JSXElement') {
      return path;
    }
  }
  
  return null;
}

function getElementTypeFromPath(jsxElementPath) {
  let elementType = 'div';
  
  if (!jsxElementPath || !jsxElementPath.node) {
    return elementType;
  }
  
  const node = jsxElementPath.node;
  
  // Handle JSXElement
  if (node.type === 'JSXElement' && node.openingElement) {
    const openingElement = node.openingElement;
    if (openingElement.name && openingElement.name.type === 'JSXIdentifier') {
      const tagName = openingElement.name.name;
      if (tagName && tagName[0] === tagName[0].toLowerCase()) {
        elementType = tagName;
      }
    }
  }
  
  // Handle JSXOpeningElement directly
  if (node.type === 'JSXOpeningElement' && node.name) {
    if (node.name.type === 'JSXIdentifier') {
      const tagName = node.name.name;
      if (tagName && tagName[0] === tagName[0].toLowerCase()) {
        elementType = tagName;
      }
    }
  }
  
  return elementType;
}

/**
 * Finds all JSX elements that use a specific class
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @param {string} classesVarName - The classes variable name
 * @param {string} className - The specific class name to find
 * @returns {Array<{element: object, attribute: object, elementType: string}>}
 */
function findJSXElementsUsingClass(j, root, classesVarName, className) {
  const elements = [];
  
  root.find(j.JSXAttribute, {
    name: { name: 'className' }
  }).forEach(attrPath => {
    const value = attrPath.node.value;
    
    // Handle simple case: className={classes.xxx}
    if (value && value.type === 'JSXExpressionContainer') {
      const expr = value.expression;
      
      // Check if it's a member expression accessing our classes object
      if (expr && expr.type === 'MemberExpression' &&
          expr.object && expr.object.name === classesVarName &&
          expr.property && 
          (expr.property.name === className || expr.property.value === className)) {
        
        // Navigate up: JSXAttribute -> JSXOpeningElement -> JSXElement
        const jsxElementPath = findJSXElementFromAttribute(attrPath);
        
        const elementType = getElementTypeFromPath(jsxElementPath);
        
        elements.push({
          element: jsxElementPath,
          attribute: attrPath,
          elementType,
          isSimple: true,
        });
      }
      
      // Handle template literal: className={`${classes.xxx} other-class`}
      if (expr && expr.type === 'TemplateLiteral' && expr.expressions) {
        expr.expressions.forEach(templateExpr => {
          if (templateExpr && templateExpr.type === 'MemberExpression' &&
              templateExpr.object && templateExpr.object.name === classesVarName &&
              templateExpr.property &&
              (templateExpr.property.name === className || templateExpr.property.value === className)) {
            
            const jsxElementPath = findJSXElementFromAttribute(attrPath);
            
            const elementType = getElementTypeFromPath(jsxElementPath);
            
            elements.push({
              element: jsxElementPath,
              attribute: attrPath,
              elementType,
              isSimple: false,
              templateExpr,
            });
          }
        });
      }
      
      // Handle clsx/classnames: className={clsx(classes.xxx, classes.yyy)}
      if (expr && expr.type === 'CallExpression' && expr.arguments) {
        expr.arguments.forEach(arg => {
          if (arg && arg.type === 'MemberExpression' &&
              arg.object && arg.object.name === classesVarName &&
              arg.property &&
              (arg.property.name === className || arg.property.value === className)) {
            
            const jsxElementPath = findJSXElementFromAttribute(attrPath);
            
            const elementType = getElementTypeFromPath(jsxElementPath);
            
            elements.push({
              element: jsxElementPath,
              attribute: attrPath,
              elementType,
              isSimple: false,
              callExpr: expr,
            });
          }
        });
      }
    }
  });
  
  return elements;
}

/**
 * Creates a mapping of class names to their JSX element types
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @param {string} classesVarName - The classes variable name
 * @param {Array<string>} classNames - List of class names
 * @returns {Map<string, string>} - Map of class name to element type
 */
function createClassToElementMap(j, root, classesVarName, classNames) {
  const elementMap = new Map();
  
  classNames.forEach(className => {
    const elements = findJSXElementsUsingClass(j, root, classesVarName, className);
    if (elements.length > 0) {
      // Use the first found element type
      elementMap.set(className, elements[0].elementType);
    } else {
      // Default to div if not found
      elementMap.set(className, 'div');
    }
  });
  
  return elementMap;
}

/**
 * Replaces a JSX element with a styled component
 * @param {object} j - jscodeshift API
 * @param {object} elementPath - Path to the JSX element
 * @param {string} styledComponentName - Name of the styled component
 * @param {string} classesVarName - The classes variable name
 * @param {string} className - The class name being replaced
 */
function replaceJSXElementWithStyled(j, elementPath, styledComponentName, classesVarName, className) {
  if (!elementPath || !elementPath.node) {
    return;
  }
  
  const jsxElement = elementPath.node;
  
  if (jsxElement.type !== 'JSXElement') {
    return;
  }
  
  const openingElement = jsxElement.openingElement;
  const closingElement = jsxElement.closingElement;
  
  if (!openingElement) {
    return;
  }
  
  // Change the element name
  openingElement.name = j.jsxIdentifier(styledComponentName);
  if (closingElement) {
    closingElement.name = j.jsxIdentifier(styledComponentName);
  }
  
  // Handle className attribute
  const classNameAttr = openingElement.attributes.find(
    attr => attr.type === 'JSXAttribute' && attr.name && attr.name.name === 'className'
  );
  
  if (classNameAttr) {
    const value = classNameAttr.value;
    
    // Simple case: className={classes.xxx} - remove the attribute
    if (value && value.type === 'JSXExpressionContainer') {
      const expr = value.expression;
      
      if (expr && expr.type === 'MemberExpression' &&
          expr.object && expr.object.name === classesVarName &&
          expr.property &&
          (expr.property.name === className || expr.property.value === className)) {
        // Remove the className attribute entirely
        openingElement.attributes = openingElement.attributes.filter(
          attr => attr !== classNameAttr
        );
      }
      
      // Template literal case - keep other classes, remove this one
      if (expr && expr.type === 'TemplateLiteral') {
        // For now, we'll keep the attribute but this could be enhanced
        // to remove just the specific class reference
      }
      
      // CallExpression case (clsx) - keep other classes
      if (expr && expr.type === 'CallExpression' && expr.arguments) {
        // Filter out the specific class from arguments
        expr.arguments = expr.arguments.filter(arg => {
          if (arg && arg.type === 'MemberExpression' &&
              arg.object && arg.object.name === classesVarName &&
              arg.property &&
              (arg.property.name === className || arg.property.value === className)) {
            return false;
          }
          return true;
        });
        
        // If only one argument left, simplify
        if (expr.arguments.length === 1) {
          classNameAttr.value = j.jsxExpressionContainer(expr.arguments[0]);
        } else if (expr.arguments.length === 0) {
          // Remove the attribute
          openingElement.attributes = openingElement.attributes.filter(
            attr => attr !== classNameAttr
          );
        }
      }
    }
  }
}

/**
 * Removes the useStyles call from the component
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @param {string} useStylesName - The useStyles hook name
 */
function removeUseStylesCall(j, root, useStylesName = 'useStyles') {
  // Find and remove: const classes = useStyles();
  root.find(j.VariableDeclaration).forEach(path => {
    const declarations = path.node.declarations;
    const filtered = declarations.filter(decl => {
      if (decl.init && decl.init.type === 'CallExpression') {
        const callee = decl.init.callee;
        if (callee && callee.type === 'Identifier' && callee.name === useStylesName) {
          return false;
        }
      }
      return true;
    });
    
    if (filtered.length === 0) {
      j(path).remove();
    } else if (filtered.length !== declarations.length) {
      path.node.declarations = filtered;
    }
  });
}

module.exports = {
  findClassUsages,
  findJSXElementsUsingClass,
  createClassToElementMap,
  replaceJSXElementWithStyled,
  removeUseStylesCall,
  getElementTypeFromPath,
};

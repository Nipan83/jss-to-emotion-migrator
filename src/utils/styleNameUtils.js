/**
 * Utility functions for converting JSS style class names to Emotion styled component names
 */

/**
 * Converts a camelCase or lowercase class name to PascalCase component name
 * @param {string} className - The JSS class name (e.g., 'root', 'buttonLabel')
 * @returns {string} - PascalCase component name (e.g., 'Root', 'ButtonLabel')
 */
function toPascalCase(className) {
  if (!className) return 'StyledComponent';
  
  // Handle special cases
  const specialMappings = {
    'root': 'Root',
    'container': 'Container',
    'wrapper': 'Wrapper',
  };
  
  if (specialMappings[className.toLowerCase()]) {
    return specialMappings[className.toLowerCase()];
  }
  
  // Convert camelCase to PascalCase
  return className.charAt(0).toUpperCase() + className.slice(1);
}

/**
 * Generates a unique styled component name based on the class name and context
 * @param {string} className - The JSS class name
 * @param {Set<string>} existingNames - Set of already used names
 * @returns {string} - Unique component name
 */
function generateUniqueComponentName(className, existingNames = new Set()) {
  let baseName = toPascalCase(className);
  let uniqueName = baseName;
  let counter = 1;
  
  while (existingNames.has(uniqueName)) {
    uniqueName = `${baseName}${counter}`;
    counter++;
  }
  
  existingNames.add(uniqueName);
  return uniqueName;
}

/**
 * Infers the HTML element type from the class name
 * @param {string} className - The JSS class name
 * @param {string} defaultElement - Default element type
 * @returns {string} - HTML element type
 */
function inferElementType(className, defaultElement = 'div') {
  const elementMappings = {
    'button': 'button',
    'btn': 'button',
    'link': 'a',
    'anchor': 'a',
    'input': 'input',
    'text': 'span',
    'label': 'span',
    'title': 'h1',
    'heading': 'h2',
    'subtitle': 'h3',
    'paragraph': 'p',
    'image': 'img',
    'img': 'img',
    'list': 'ul',
    'listItem': 'li',
    'item': 'li',
    'form': 'form',
    'header': 'header',
    'footer': 'footer',
    'nav': 'nav',
    'section': 'section',
    'article': 'article',
    'aside': 'aside',
    'main': 'main',
  };
  
  const lowerClassName = className.toLowerCase();
  
  for (const [key, element] of Object.entries(elementMappings)) {
    if (lowerClassName.includes(key)) {
      return element;
    }
  }
  
  return defaultElement;
}

/**
 * Extracts element type from JSX usage in the code
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @param {string} className - The class name to look for
 * @returns {string|null} - Element type or null if not found
 */
function extractElementTypeFromUsage(j, root, className) {
  let elementType = null;
  
  // Look for className={classes.xxx} patterns
  root.find(j.JSXAttribute, {
    name: { name: 'className' }
  }).forEach(path => {
    const value = path.node.value;
    
    // Handle className={classes.xxx}
    if (value && value.type === 'JSXExpressionContainer') {
      const expr = value.expression;
      if (expr.type === 'MemberExpression' &&
          expr.property.name === className) {
        // Get the parent JSXOpeningElement
        const jsxElement = path.parentPath.parentPath;
        if (jsxElement && jsxElement.node.type === 'JSXElement') {
          const openingElement = jsxElement.node.openingElement;
          if (openingElement.name.type === 'JSXIdentifier') {
            const tagName = openingElement.name.name;
            // Only use if it's a lowercase HTML element
            if (tagName[0] === tagName[0].toLowerCase()) {
              elementType = tagName;
            }
          }
        }
      }
    }
  });
  
  return elementType;
}

module.exports = {
  toPascalCase,
  generateUniqueComponentName,
  inferElementType,
  extractElementTypeFromUsage,
};

/**
 * Utility functions for parsing JSS style objects
 */

/**
 * Checks if an object property uses theme
 * @param {object} j - jscodeshift API
 * @param {object} node - AST node
 * @returns {boolean}
 */
function usesTheme(j, node) {
  let hasTheme = false;
  
  j(node).find(j.Identifier, { name: 'theme' }).forEach(() => {
    hasTheme = true;
  });
  
  return hasTheme;
}

/**
 * Checks if a style object uses props
 * @param {object} j - jscodeshift API
 * @param {object} node - AST node
 * @param {string} propsParamName - The parameter name for props
 * @returns {boolean}
 */
function usesProps(j, node, propsParamName = 'props') {
  let hasProps = false;

  j(node).find(j.Identifier, { name: propsParamName }).forEach(() => {
    hasProps = true;
  });

  return hasProps;
}

/**
 * Detects which props are used in a style object for dynamic styling
 * Based on patterns like: const StyledComponent = styled(Component)(({ propName }) => ({...}))
 * @param {object} j - jscodeshift API
 * @param {object} node - AST node
 * @returns {Array<string>} - Array of prop names used in the styles
 */
function detectUsedProps(j, node) {
  const usedProps = new Set();

  // Find conditional expressions that reference props
  j(node).find(j.ConditionalExpression).forEach(path => {
    // Look for patterns like: propName ? 'value1' : 'value2'
    if (path.node.test && path.node.test.type === 'Identifier') {
      usedProps.add(path.node.test.name);
    }
    // Look for patterns like: props.propName ? 'value1' : 'value2'
    if (path.node.test && path.node.test.type === 'MemberExpression') {
      if (path.node.test.property && path.node.test.property.type === 'Identifier') {
        usedProps.add(path.node.test.property.name);
      }
    }
  });

  // Find member expressions accessing props
  j(node).find(j.MemberExpression).forEach(path => {
    // Pattern: props.propName
    if (path.node.object && path.node.object.type === 'Identifier' &&
        path.node.object.name === 'props' &&
        path.node.property && path.node.property.type === 'Identifier') {
      usedProps.add(path.node.property.name);
    }
  });

  // Find identifiers that might be destructured props
  j(node).find(j.Identifier).forEach(path => {
    const name = path.node.name;
    // Common prop patterns (excluding common JS keywords and theme)
    const excludeList = ['theme', 'return', 'if', 'const', 'let', 'var', 'true', 'false',
                         'null', 'undefined', 'key', 'index', 'item'];
    if (!excludeList.includes(name) &&
        path.parent &&
        path.parent.node &&
        path.parent.node.type === 'ConditionalExpression') {
      usedProps.add(name);
    }
  });

  return Array.from(usedProps);
}

/**
 * Checks if styles contain spread operators with conditional logic
 * Pattern: ...propName && { styles }
 * @param {object} j - jscodeshift API
 * @param {object} node - AST node
 * @returns {boolean}
 */
function hasConditionalSpread(j, node) {
  let hasSpread = false;

  j(node).find(j.SpreadElement).forEach(path => {
    const argument = path.node.argument;
    // Check for: ...condition && { styles }
    if (argument && argument.type === 'LogicalExpression' && argument.operator === '&&') {
      hasSpread = true;
    }
  });

  return hasSpread;
}

/**
 * Extracts style properties from a JSS style object
 * @param {object} j - jscodeshift API
 * @param {object} styleObject - The style object AST node
 * @returns {Array<{name: string, value: object, usesTheme: boolean}>}
 */
function extractStyleClasses(j, styleObject) {
  const classes = [];
  
  if (!styleObject || styleObject.type !== 'ObjectExpression') {
    return classes;
  }
  
  styleObject.properties.forEach(prop => {
    if (prop.type === 'ObjectProperty' || prop.type === 'Property') {
      const name = prop.key.name || prop.key.value;
      const value = prop.value;
      const hasTheme = usesTheme(j, value);
      
      classes.push({
        name,
        value,
        usesTheme: hasTheme,
      });
    }
  });
  
  return classes;
}

/**
 * Checks if makeStyles uses a function with theme parameter
 * @param {object} node - The makeStyles argument node
 * @returns {boolean}
 */
function isFunctionWithTheme(node) {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression'
  ) && node.params.length > 0;
}

/**
 * Gets the theme parameter name from a function
 * @param {object} node - Function node
 * @returns {string|null}
 */
function getThemeParamName(node) {
  if (!isFunctionWithTheme(node)) return null;
  
  const firstParam = node.params[0];
  if (firstParam.type === 'Identifier') {
    return firstParam.name;
  }
  return null;
}

/**
 * Extracts the style object from makeStyles argument
 * @param {object} node - makeStyles argument (function or object)
 * @returns {object} - {styleObject, themeParam}
 */
function extractStyleObjectFromMakeStyles(node) {
  // Case 1: makeStyles({ ... })
  if (node.type === 'ObjectExpression') {
    return { styleObject: node, themeParam: null };
  }
  
  // Case 2: makeStyles((theme) => ({ ... }))
  if (node.type === 'ArrowFunctionExpression') {
    const themeParam = getThemeParamName(node);
    let styleObject = node.body;
    
    // Handle ({ ... }) - parenthesized object expression
    if (styleObject.type === 'ObjectExpression') {
      return { styleObject, themeParam };
    }
    
    // Handle () => { return { ... } }
    if (styleObject.type === 'BlockStatement') {
      const returnStatement = styleObject.body.find(
        stmt => stmt.type === 'ReturnStatement'
      );
      if (returnStatement && returnStatement.argument) {
        return { styleObject: returnStatement.argument, themeParam };
      }
    }
  }
  
  // Case 3: makeStyles(function(theme) { return { ... } })
  if (node.type === 'FunctionExpression') {
    const themeParam = getThemeParamName(node);
    const returnStatement = node.body.body.find(
      stmt => stmt.type === 'ReturnStatement'
    );
    if (returnStatement && returnStatement.argument) {
      return { styleObject: returnStatement.argument, themeParam };
    }
  }
  
  return { styleObject: null, themeParam: null };
}

/**
 * Clones and transforms a style value for Emotion
 * Replaces theme param name if different from 'theme'
 * @param {object} j - jscodeshift API
 * @param {object} node - Style value node
 * @param {string} originalThemeParam - Original theme parameter name
 * @returns {object} - Cloned and transformed node
 */
function transformStyleValue(j, node, originalThemeParam = 'theme') {
  // If theme param is already 'theme', just return a clone
  if (originalThemeParam === 'theme' || !originalThemeParam) {
    return node;
  }
  
  // Clone and replace theme param name
  const cloned = JSON.parse(JSON.stringify(node));
  
  // This is a simplified approach - for complex cases, 
  // you might need deeper AST transformation
  const source = j(node).toSource();
  const transformed = source.replace(
    new RegExp(`\\b${originalThemeParam}\\b`, 'g'),
    'theme'
  );
  
  return j(transformed).nodes()[0];
}

module.exports = {
  usesTheme,
  usesProps,
  detectUsedProps,
  hasConditionalSpread,
  extractStyleClasses,
  isFunctionWithTheme,
  getThemeParamName,
  extractStyleObjectFromMakeStyles,
  transformStyleValue,
};

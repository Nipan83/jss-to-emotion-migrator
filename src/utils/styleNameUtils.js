/**
 * Utility functions for converting JSS style class names to Emotion styled component names
 */

/**
 * Converts a camelCase or lowercase class name to PascalCase component name
 * following the established pattern from img-tile-preview-graph.js and img-multi-tabs-component.js
 * @param {string} className - The JSS class name (e.g., 'root', 'buttonLabel')
 * @returns {string} - PascalCase component name (e.g., 'StyledBox', 'CategoryText')
 */
function toPascalCase(className) {
  if (!className) return 'StyledComponent';

  // Handle special semantic mappings based on established patterns
  const semanticMappings = {
    // Common patterns from refactored files
    'root': 'StyledBox',
    'container': 'StyledBox',
    'wrapper': 'StyledBox',
    'box': 'StyledBox',

    // Text/Typography patterns
    'title': 'TitleText',
    'subtitle': 'SubtitleText',
    'text': 'StyledText',
    'label': 'LabelText',
    'description': 'DescriptionText',
    'message': 'MessageText',
    'caption': 'CaptionText',
    'heading': 'HeadingText',
    'category': 'CategoryText',

    // Button patterns
    'button': 'StyledButton',
    'btn': 'StyledButton',
    'actionButton': 'ActionButton',
    'submitButton': 'SubmitButton',
    'cancelButton': 'CancelButton',
    'closeButton': 'CloseButton',

    // Icon patterns
    'icon': 'StyledIcon',
    'loadingIcon': 'LoadingIcon',
    'closeIcon': 'CloseIcon',
    'checkIcon': 'CheckIcon',

    // Layout patterns
    'header': 'HeaderBox',
    'footer': 'FooterBox',
    'sidebar': 'SidebarBox',
    'content': 'ContentBox',
    'panel': 'PanelBox',
    'section': 'SectionBox',
    'row': 'RowBox',
    'column': 'ColumnBox',

    // Tab patterns
    'tab': 'StyledTab',
    'tabs': 'StyledTabs',
    'tabPanel': 'TabPanel',
    'tabContainer': 'TabsContainer',

    // Card patterns
    'card': 'StyledCard',
    'cardContent': 'CardContentBox',
    'cardHeader': 'CardHeaderBox',

    // Notification patterns
    'notification': 'NotificationBox',
    'alert': 'AlertBox',
    'notification': 'TrialModeNotification',
    'trialNotification': 'TrialModeNotification',

    // Loading patterns
    'loading': 'LoadingIcon',
    'loader': 'LoadingIcon',
    'spinner': 'LoadingIcon',
    'progress': 'LoadingIcon',
  };

  const lowerClassName = className.toLowerCase();

  // Check for exact matches first
  if (semanticMappings[lowerClassName]) {
    return semanticMappings[lowerClassName];
  }

  // Check for partial matches
  for (const [key, value] of Object.entries(semanticMappings)) {
    if (lowerClassName.includes(key)) {
      // If it's a descriptive name like 'primaryButton', create 'PrimaryButton'
      if (lowerClassName !== key) {
        return className.charAt(0).toUpperCase() + className.slice(1);
      }
      return value;
    }
  }

  // Default: Convert camelCase to PascalCase with 'Styled' prefix
  const pascalCase = className.charAt(0).toUpperCase() + className.slice(1);

  // Add 'Styled' prefix if it's a generic name
  const genericTerms = ['div', 'span', 'section', 'item', 'element'];
  if (genericTerms.includes(lowerClassName)) {
    return `Styled${pascalCase}`;
  }

  return pascalCase;
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
 * Infers the HTML element or MUI component type from the class name
 * Based on patterns from img-tile-preview-graph.js and img-multi-tabs-component.js
 * @param {string} className - The JSS class name
 * @param {string} defaultElement - Default element type
 * @returns {string} - HTML element type or MUI component name
 */
function inferElementType(className, defaultElement = 'Box') {
  // MUI component mappings (prioritized for styled components)
  const muiComponentMappings = {
    'box': 'Box',
    'container': 'Box',
    'wrapper': 'Box',
    'root': 'Box',
    'text': 'Typography',
    'title': 'Typography',
    'subtitle': 'Typography',
    'label': 'Typography',
    'heading': 'Typography',
    'category': 'Typography',
    'description': 'Typography',
    'message': 'Typography',
    'caption': 'Typography',
    'button': 'Button',
    'btn': 'Button',
    'actionButton': 'Button',
    'icon': 'Box',
    'loading': 'CircularProgress',
    'loader': 'CircularProgress',
    'spinner': 'CircularProgress',
    'progress': 'CircularProgress',
    'card': 'Card',
    'paper': 'Paper',
    'tab': 'Tab',
    'tabs': 'Tabs',
    'notification': 'Box',
    'alert': 'Box',
  };

  // HTML element mappings (fallback for non-MUI cases)
  const htmlElementMappings = {
    'link': 'a',
    'anchor': 'a',
    'input': 'input',
    'form': 'form',
    'header': 'header',
    'footer': 'footer',
    'nav': 'nav',
    'section': 'section',
    'article': 'article',
    'aside': 'aside',
    'main': 'main',
    'paragraph': 'p',
    'image': 'img',
    'img': 'img',
    'list': 'ul',
    'listItem': 'li',
    'item': 'li',
    'span': 'span',
    'div': 'div',
  };

  const lowerClassName = className.toLowerCase();

  // Check MUI components first
  for (const [key, component] of Object.entries(muiComponentMappings)) {
    if (lowerClassName.includes(key)) {
      return component;
    }
  }

  // Check HTML elements
  for (const [key, element] of Object.entries(htmlElementMappings)) {
    if (lowerClassName.includes(key)) {
      return element;
    }
  }

  // Default to Box for styled components (MUI pattern)
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

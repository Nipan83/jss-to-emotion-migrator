/**
 * Cleanup transform to remove unused JSS imports and dead code
 * 
 * Features:
 * - Removes unused JSS imports (makeStyles, withStyles, createStyles)
 * - Removes unused style variable declarations
 * - Detects files that are now empty or only have JSS-related code (dead code)
 * - Can optionally delete dead code files
 */

const {
  findJSSImports,
  findDefaultJSSImports,
  removeJSSImports,
} = require('../utils');

/**
 * Checks if an identifier is used in the code (excluding its own declaration)
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @param {string} name - Identifier name to check
 * @param {object} declarationNode - The declaration node to exclude
 * @returns {boolean} - True if the identifier is used elsewhere
 */
function isIdentifierUsed(j, root, name, declarationNode = null) {
  let usageCount = 0;
  
  root.find(j.Identifier, { name }).forEach(path => {
    // Skip if it's the declaration itself
    if (declarationNode) {
      // Check if this identifier is part of the declaration
      let current = path;
      while (current) {
        if (current.node === declarationNode) {
          return; // Skip this occurrence
        }
        current = current.parentPath;
      }
    }
    
    // Skip import specifiers
    if (path.parentPath && 
        (path.parentPath.node.type === 'ImportSpecifier' ||
         path.parentPath.node.type === 'ImportDefaultSpecifier')) {
      return;
    }
    
    usageCount++;
  });
  
  return usageCount > 0;
}

/**
 * Finds unused JSS-related variable declarations
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @returns {Array<{name: string, path: object}>}
 */
function findUnusedStyleDeclarations(j, root) {
  const unused = [];
  
  // Find patterns like: const useStyles = makeStyles(...) or const styles = (theme) => ({...})
  root.find(j.VariableDeclarator).forEach(path => {
    const name = path.node.id.name;
    const init = path.node.init;
    
    if (!init) return;
    
    // Check if it's a makeStyles/withStyles call
    const isMakeStylesCall = init.type === 'CallExpression' &&
      init.callee.type === 'Identifier' &&
      ['makeStyles', 'withStyles', 'createStyles'].includes(init.callee.name);
    
    // Check if it looks like a styles object/function
    const isStylesDeclaration = 
      (name === 'styles' || name.endsWith('Styles') || name.endsWith('Style')) &&
      (init.type === 'ArrowFunctionExpression' || 
       init.type === 'FunctionExpression' ||
       init.type === 'ObjectExpression');
    
    // Check if it's a useStyles hook result
    const isUseStylesResult = init.type === 'CallExpression' &&
      init.callee.type === 'Identifier' &&
      init.callee.name.startsWith('use') &&
      init.callee.name.endsWith('Styles');
    
    if (isMakeStylesCall || isStylesDeclaration || isUseStylesResult) {
      // Check if this variable is used anywhere
      if (!isIdentifierUsed(j, root, name, path.node)) {
        unused.push({ name, path });
      }
    }
  });
  
  return unused;
}

/**
 * Removes unused variable declarations
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @param {Array<{name: string, path: object}>} unusedDeclarations
 */
function removeUnusedDeclarations(j, root, unusedDeclarations) {
  const namesToRemove = new Set(unusedDeclarations.map(d => d.name));
  
  root.find(j.VariableDeclaration).forEach(path => {
    const originalLength = path.node.declarations.length;
    path.node.declarations = path.node.declarations.filter(decl => {
      return !namesToRemove.has(decl.id.name);
    });
    
    if (path.node.declarations.length === 0) {
      j(path).remove();
    }
  });
}

/**
 * Finds unused imports (not just JSS, but any unused imports)
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @returns {Array<{name: string, path: object, specifierIndex: number}>}
 */
function findUnusedImports(j, root) {
  const unused = [];
  
  root.find(j.ImportDeclaration).forEach(importPath => {
    importPath.node.specifiers.forEach((spec, index) => {
      const localName = spec.local.name;
      
      // Check if this import is used anywhere in the code
      let usageCount = 0;
      root.find(j.Identifier, { name: localName }).forEach(idPath => {
        // Skip the import specifier itself
        if (idPath.parentPath.node.type === 'ImportSpecifier' ||
            idPath.parentPath.node.type === 'ImportDefaultSpecifier' ||
            idPath.parentPath.node.type === 'ImportNamespaceSpecifier') {
          return;
        }
        usageCount++;
      });
      
      if (usageCount === 0) {
        unused.push({
          name: localName,
          path: importPath,
          specifierIndex: index,
          source: importPath.node.source.value,
        });
      }
    });
  });
  
  return unused;
}

/**
 * Removes unused imports
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @param {Array} unusedImports
 */
function removeUnusedImports(j, root, unusedImports) {
  // Group by import path
  const byPath = new Map();
  unusedImports.forEach(imp => {
    if (!byPath.has(imp.path)) {
      byPath.set(imp.path, []);
    }
    byPath.get(imp.path).push(imp.name);
  });
  
  byPath.forEach((names, importPath) => {
    const namesToRemove = new Set(names);
    const specifiers = importPath.node.specifiers;
    
    importPath.node.specifiers = specifiers.filter(spec => {
      return !namesToRemove.has(spec.local.name);
    });
    
    if (importPath.node.specifiers.length === 0) {
      j(importPath).remove();
    }
  });
}

/**
 * Analyzes if a file is "dead" (only contains JSS-related code that's no longer needed)
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @returns {{isDead: boolean, reason: string}}
 */
function analyzeIfDeadFile(j, root) {
  const program = root.get().node.program;
  const body = program.body;
  
  // Filter out import declarations
  const nonImports = body.filter(node => node.type !== 'ImportDeclaration');
  
  if (nonImports.length === 0) {
    return { isDead: true, reason: 'File only contains imports (no exports or code)' };
  }
  
  // Check if remaining code is only style-related
  let hasOnlyStyleCode = true;
  let hasExports = false;
  
  for (const node of nonImports) {
    if (node.type === 'ExportDefaultDeclaration' || 
        node.type === 'ExportNamedDeclaration') {
      hasExports = true;
      
      // Check if export is style-related
      const decl = node.declaration;
      if (decl) {
        if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            const name = d.id.name;
            if (!(name === 'styles' || name.endsWith('Styles') || name.endsWith('Style'))) {
              hasOnlyStyleCode = false;
            }
          }
        } else if (decl.type === 'Identifier') {
          const name = decl.name;
          if (!(name === 'styles' || name.endsWith('Styles') || name.endsWith('Style'))) {
            hasOnlyStyleCode = false;
          }
        } else {
          hasOnlyStyleCode = false;
        }
      }
    } else if (node.type === 'VariableDeclaration') {
      // Check if it's a style declaration
      for (const d of node.declarations) {
        const name = d.id.name;
        if (!(name === 'styles' || name.endsWith('Styles') || name.endsWith('Style') ||
              name.startsWith('use') && name.endsWith('Styles'))) {
          hasOnlyStyleCode = false;
        }
      }
    } else {
      // Any other type of statement means it's not dead
      hasOnlyStyleCode = false;
    }
  }
  
  if (hasOnlyStyleCode && nonImports.length > 0) {
    return { isDead: true, reason: 'File only contains style definitions' };
  }
  
  return { isDead: false, reason: '' };
}

/**
 * Main cleanup transformer
 * @param {object} fileInfo - File information
 * @param {object} api - jscodeshift API
 * @param {object} options - Transform options
 * @returns {string|null} - Transformed source or null if file should be deleted
 */
function transformer(fileInfo, api, options = {}) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  
  let hasChanges = false;
  const report = {
    removedImports: [],
    removedDeclarations: [],
    isDead: false,
    deadReason: '',
  };
  
  // Step 1: Find and remove unused JSS imports
  const namedJSSImports = findJSSImports(j, root);
  const defaultJSSImports = findDefaultJSSImports(j, root);
  const allJSSImports = [...namedJSSImports, ...defaultJSSImports];
  
  // Check which JSS imports are unused
  const unusedJSSImports = allJSSImports.filter(imp => {
    return !isIdentifierUsed(j, root, imp.localName, null);
  });
  
  if (unusedJSSImports.length > 0) {
    removeJSSImports(j, root, unusedJSSImports);
    report.removedImports.push(...unusedJSSImports.map(i => i.localName));
    hasChanges = true;
  }
  
  // Step 2: Find and remove unused style declarations
  const unusedDeclarations = findUnusedStyleDeclarations(j, root);
  
  if (unusedDeclarations.length > 0) {
    removeUnusedDeclarations(j, root, unusedDeclarations);
    report.removedDeclarations.push(...unusedDeclarations.map(d => d.name));
    hasChanges = true;
  }
  
  // Step 3: Find and remove other unused imports (optional, based on options)
  if (options.removeAllUnusedImports) {
    const unusedImports = findUnusedImports(j, root);
    if (unusedImports.length > 0) {
      removeUnusedImports(j, root, unusedImports);
      report.removedImports.push(...unusedImports.map(i => i.name));
      hasChanges = true;
    }
  }
  
  // Step 4: Analyze if file is now dead (only style code)
  const deadAnalysis = analyzeIfDeadFile(j, root);
  if (deadAnalysis.isDead) {
    report.isDead = true;
    report.deadReason = deadAnalysis.reason;
  }
  
  // Return result object with source and report
  if (hasChanges) {
    const transformedSource = root.toSource({
      quote: 'single',
      trailingComma: true,
    });
    
    return {
      source: transformedSource,
      report: report,
      changed: true,
    };
  }
  
  // Return original if no changes
  return {
    source: fileInfo.source,
    report: report,
    changed: false,
  };
}

/**
 * Standalone function to analyze a file for cleanup opportunities
 */
function analyzeFile(source, options = {}) {
  const jscodeshift = require('jscodeshift');
  const j = jscodeshift.withParser(options.parser || 'babel');
  const root = j(source);
  
  const analysis = {
    unusedJSSImports: [],
    unusedStyleDeclarations: [],
    unusedImports: [],
    isDead: false,
    deadReason: '',
  };
  
  // Find unused JSS imports
  const namedJSSImports = findJSSImports(j, root);
  const defaultJSSImports = findDefaultJSSImports(j, root);
  const allJSSImports = [...namedJSSImports, ...defaultJSSImports];
  
  allJSSImports.forEach(imp => {
    if (!isIdentifierUsed(j, root, imp.localName, null)) {
      analysis.unusedJSSImports.push(imp.localName);
    }
  });
  
  // Find unused style declarations
  const unusedDecl = findUnusedStyleDeclarations(j, root);
  analysis.unusedStyleDeclarations = unusedDecl.map(d => d.name);
  
  // Find all unused imports
  const unusedImports = findUnusedImports(j, root);
  analysis.unusedImports = unusedImports.map(i => ({
    name: i.name,
    source: i.source,
  }));
  
  // Check if dead file
  const deadAnalysis = analyzeIfDeadFile(j, root);
  analysis.isDead = deadAnalysis.isDead;
  analysis.deadReason = deadAnalysis.reason;
  
  return analysis;
}

module.exports = transformer;
module.exports.parser = 'babel';
module.exports.analyzeFile = analyzeFile;
module.exports.findUnusedImports = findUnusedImports;
module.exports.findUnusedStyleDeclarations = findUnusedStyleDeclarations;
module.exports.analyzeIfDeadFile = analyzeIfDeadFile;

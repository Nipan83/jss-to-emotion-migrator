/**
 * Utility functions for handling imports during migration
 */

/**
 * Finds existing makeStyles/withStyles/createStyles imports
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @returns {Array<{path: object, importName: string, source: string}>}
 */
function findJSSImports(j, root) {
  const jssImports = [];
  const jssNames = ['makeStyles', 'withStyles', 'createStyles'];
  
  root.find(j.ImportDeclaration).forEach(path => {
    const source = path.node.source.value;
    
    // Check for MUI styles imports
    if (source.includes('@mui/styles') || 
        source.includes('@material-ui/styles') ||
        source.includes('@material-ui/core/styles') ||
        source.includes('@mui/material/styles')) {
      
      path.node.specifiers.forEach(specifier => {
        if (specifier.type === 'ImportSpecifier') {
          const importedName = specifier.imported.name;
          if (jssNames.includes(importedName)) {
            jssImports.push({
              path,
              importName: importedName,
              localName: specifier.local.name,
              source,
            });
          }
        } else if (specifier.type === 'ImportDefaultSpecifier') {
          const localName = specifier.local.name;
          if (jssNames.includes(localName)) {
            jssImports.push({
              path,
              importName: localName,
              localName,
              source,
            });
          }
        }
      });
    }
  });
  
  return jssImports;
}

/**
 * Finds default imports like: import makeStyles from '@mui/styles/makeStyles'
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @returns {Array<{path: object, importName: string, source: string}>}
 */
function findDefaultJSSImports(j, root) {
  const jssImports = [];
  const jssNames = ['makeStyles', 'withStyles', 'createStyles'];
  
  root.find(j.ImportDeclaration).forEach(path => {
    const source = path.node.source.value;
    
    // Check for direct imports like '@mui/styles/makeStyles'
    jssNames.forEach(name => {
      if (source.endsWith(`/${name}`)) {
        path.node.specifiers.forEach(specifier => {
          if (specifier.type === 'ImportDefaultSpecifier') {
            jssImports.push({
              path,
              importName: name,
              localName: specifier.local.name,
              source,
            });
          }
        });
      }
    });
  });
  
  return jssImports;
}

/**
 * Removes JSS imports from the file
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 * @param {Array} jssImports - Array of JSS import info
 */
function removeJSSImports(j, root, jssImports) {
  // Track paths we've already removed to avoid duplicate removal
  const removedPaths = new Set();
  
  jssImports.forEach(({ path, importName, localName }) => {
    // Skip if path is no longer valid or already processed
    if (!path || !path.node || removedPaths.has(path)) {
      return;
    }
    
    const importDecl = path.node;
    
    // Check if specifiers exists
    if (!importDecl.specifiers) {
      return;
    }
    
    // If it's a default import for the specific JSS function, remove entire import
    if (importDecl.specifiers.length === 1) {
      try {
        j(path).remove();
        removedPaths.add(path);
      } catch (e) {
        // Path may have been already removed
      }
    } else {
      // Remove just the specific specifier
      importDecl.specifiers = importDecl.specifiers.filter(spec => {
        if (spec.type === 'ImportSpecifier') {
          return spec.imported.name !== importName && spec.local.name !== localName;
        }
        if (spec.type === 'ImportDefaultSpecifier') {
          return spec.local.name !== localName;
        }
        return true;
      });
      
      // If no specifiers left, remove the import
      if (importDecl.specifiers.length === 0) {
        try {
          j(path).remove();
          removedPaths.add(path);
        } catch (e) {
          // Path may have been already removed
        }
      }
    }
  });
}

/**
 * Adds styled import from @mui/material/styles
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 */
function addStyledImport(j, root) {
  // Check if styled is already imported
  let hasStyled = false;
  let muiStylesImport = null;
  
  root.find(j.ImportDeclaration).forEach(path => {
    const source = path.node.source.value;
    
    if (source === '@mui/material/styles' || source === '@mui/system') {
      muiStylesImport = path;
      path.node.specifiers.forEach(spec => {
        if (spec.type === 'ImportSpecifier' && spec.imported.name === 'styled') {
          hasStyled = true;
        }
      });
    }
  });
  
  if (hasStyled) return;
  
  // If there's an existing @mui/material/styles import, add styled to it
  if (muiStylesImport) {
    muiStylesImport.node.specifiers.push(
      j.importSpecifier(j.identifier('styled'))
    );
    return;
  }
  
  // Create new import
  const styledImport = j.importDeclaration(
    [j.importSpecifier(j.identifier('styled'))],
    j.literal('@mui/material/styles')
  );
  
  // Prefer placing it right after the last existing `@mui/*` import so it groups
  // with the other MUI imports (matches the observed convention); otherwise fall
  // back to after the last import, or the top of the file.
  const imports = root.find(j.ImportDeclaration);
  if (imports.length > 0) {
    let anchor = null;
    imports.forEach(path => {
      const source = path.node.source.value;
      if (typeof source === 'string' && source.startsWith('@mui/')) {
        anchor = path;
      }
    });
    if (!anchor) {
      anchor = imports.at(-1).get();
    }
    j(anchor).insertAfter(styledImport);
  } else {
    // Add at the beginning of the file
    root.get().node.program.body.unshift(styledImport);
  }
}

/**
 * Removes unused imports (like clsx if no longer needed)
 * @param {object} j - jscodeshift API
 * @param {object} root - AST root
 */
function cleanupUnusedImports(j, root) {
  // Find all import specifiers
  const importedNames = new Map();
  
  root.find(j.ImportDeclaration).forEach(path => {
    path.node.specifiers.forEach(spec => {
      const localName = spec.local.name;
      importedNames.set(localName, path);
    });
  });
  
  // Check if each imported name is used
  importedNames.forEach((importPath, name) => {
    let usageCount = 0;
    
    root.find(j.Identifier, { name }).forEach(idPath => {
      // Skip the import specifier itself
      if (idPath.parentPath.node.type === 'ImportSpecifier' ||
          idPath.parentPath.node.type === 'ImportDefaultSpecifier') {
        return;
      }
      usageCount++;
    });
    
    // If not used, consider removing (but be careful with side-effect imports)
    // This is a conservative approach - only log for now
  });
}

module.exports = {
  findJSSImports,
  findDefaultJSSImports,
  removeJSSImports,
  addStyledImport,
  cleanupUnusedImports,
};

/**
 * JSS to Emotion Migrator
 *
 * A codemod tool to migrate JSS styles (makeStyles, withStyles, createStyles)
 * to Emotion using MUI styled API.
 */

const jscodeshift = require('jscodeshift');
const transforms = require('./transforms');
const utils = require('./utils');

/**
 * Migrates a single file's source code
 * @param {string} source - Source code to transform
 * @param {object} options - Transform options
 * @returns {string} - Transformed source code
 */
function migrate(source, options = {}) {
  const {
    parser = 'babel',
    transform = 'jssToEmotion',
    filePath = 'unknown.js',
  } = options;

  const j = jscodeshift.withParser(parser);

  const transformFn = transforms[transform] || transforms.jssToEmotion;

  const fileInfo = {
    path: filePath,
    source,
  };

  const api = {
    jscodeshift: j,
    stats: () => {},
    report: console.log,
  };

  return transformFn(fileInfo, api, options);
}

/**
 * Cleans up unused JSS imports and dead code
 * @param {string} source - Source code to clean
 * @param {object} options - Cleanup options
 * @returns {object} - { source: string, report: object }
 */
function cleanup(source, options = {}) {
  const {
    parser = 'babel',
    filePath = 'unknown.js',
  } = options;

  const j = jscodeshift.withParser(parser);

  const fileInfo = {
    path: filePath,
    source,
  };

  const api = {
    jscodeshift: j,
    stats: () => {},
    report: console.log,
  };

  const result = transforms.cleanupJSS(fileInfo, api, options);

  // Handle both old string return and new object return
  if (typeof result === 'object' && result.source) {
    return {
      source: result.source,
      report: result.report || {
        removedImports: [],
        removedDeclarations: [],
        isDead: false,
        deadReason: '',
      },
    };
  }

  // Fallback for string return (shouldn't happen anymore)
  return {
    source: typeof result === 'string' ? result : source,
    report: {
      removedImports: [],
      removedDeclarations: [],
      isDead: false,
      deadReason: '',
    },
  };
}

/**
 * Analyzes a file for cleanup opportunities without making changes
 * @param {string} source - Source code to analyze
 * @param {object} options - Analysis options
 * @returns {object} - Analysis report
 */
function analyzeForCleanup(source, options = {}) {
  return transforms.cleanupJSS.analyzeFile(source, options);
}

/**
 * Creates a jscodeshift transform function
 * @param {string} transformName - Name of the transform
 * @returns {Function} - jscodeshift transform function
 */
function createTransform(transformName = 'jssToEmotion') {
  return transforms[transformName] || transforms.jssToEmotion;
}

module.exports = {
  migrate,
  cleanup,
  analyzeForCleanup,
  createTransform,
  transforms,
  utils,
};

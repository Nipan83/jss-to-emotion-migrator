/**
 * Utility functions index
 */

const styleNameUtils = require('./styleNameUtils');
const styleParser = require('./styleParser');
const jsxTransformer = require('./jsxTransformer');
const importHandler = require('./importHandler');
const muiSlots = require('./muiSlots');

module.exports = {
  ...styleNameUtils,
  ...styleParser,
  ...jsxTransformer,
  ...importHandler,
  ...muiSlots,
};

/**
 * Transforms index
 */

const makeStylesTransform = require('./makeStyles');
const withStylesTransform = require('./withStyles');
const jssToEmotionTransform = require('./jssToEmotion');
const cleanupJSSTransform = require('./cleanupJSS');

module.exports = {
  makeStyles: makeStylesTransform,
  withStyles: withStylesTransform,
  jssToEmotion: jssToEmotionTransform,
  cleanupJSS: cleanupJSSTransform,
};

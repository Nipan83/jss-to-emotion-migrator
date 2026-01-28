/**
 * Transforms index
 */

const makeStylesTransform = require('./makeStyles');
const withStylesTransform = require('./withStyles');
const jssToEmotionTransform = require('./jssToEmotion');
const jssToEmotionMUITransform = require('./jssToEmotionMUI');
const cleanupJSSTransform = require('./cleanupJSS');

module.exports = {
  makeStyles: makeStylesTransform,
  withStyles: withStylesTransform,
  jssToEmotion: jssToEmotionTransform,
  jssToEmotionMUI: jssToEmotionMUITransform,
  cleanupJSS: cleanupJSSTransform,
};

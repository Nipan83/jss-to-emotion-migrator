/**
 * Transforms index.
 *
 * `jssToEmotion` is the single, canonical migration transform. It produces
 * individual `styled(<MuiComponent | 'htmlTag'>)` components and handles
 * makeStyles, withStyles, createStyles, the MUI `classes={{ slot }}` prop,
 * conditional (prop-based) styling and HOC/compose cleanup.
 *
 * The previous strategy-specific transforms are retained as deprecated aliases
 * so existing references keep working while emitting the current, correct
 * output:
 *   - `makeStyles`      → alias of jssToEmotion
 *   - `withStyles`      → alias of jssToEmotion
 *   - `jssToEmotionMUI` → alias of jssToEmotion (the old PREFIX + <Root> pattern
 *     is no longer produced; no target codebase used it)
 */

const jssToEmotionTransform = require('./jssToEmotion');
const cleanupJSSTransform = require('./cleanupJSS');

module.exports = {
  jssToEmotion: jssToEmotionTransform,
  // Deprecated aliases → unified transform.
  makeStyles: jssToEmotionTransform,
  withStyles: jssToEmotionTransform,
  jssToEmotionMUI: jssToEmotionTransform,
  cleanupJSS: cleanupJSSTransform,
};

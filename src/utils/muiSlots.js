/**
 * MUI slot / state-class mapping utilities.
 *
 * Encodes the conventions observed across the imaging-fe JSS→Emotion migration:
 *
 *   <Comp classes={{ root: classes.a, indicator: classes.b, selected: classes.c }} />
 *
 * becomes a single `styled(Comp)` whose style object is:
 *   {
 *     ...root styles (top-level, flattened),
 *     '& .MuiComp-indicator': { ...indicator styles },   // structural slot
 *     '&.Mui-selected':       { ...selected styles },     // global state slot
 *   }
 *
 * Rules (deterministic, from the real commits):
 *   - `root`                         → top-level (no selector wrapper)
 *   - a MUI *global state* slot      → `&.Mui-<slot>`      (single ampersand, no space)
 *   - any other (structural) slot    → `& .Mui<Comp>-<slot>` (descendant, space)
 */

/**
 * MUI global state classes. These live on the element itself (`.Mui-selected`,
 * `.Mui-checked`, …) rather than on a child slot, so they map to `&.Mui-<slot>`.
 * https://mui.com/material-ui/customization/how-to-customize/#state-classes
 */
const MUI_STATE_SLOTS = new Set([
  'selected',
  'checked',
  'disabled',
  'focused',
  'focusVisible',
  'error',
  'required',
  'expanded',
  'active',
  'completed',
  'readOnly',
  'indeterminate',
]);

/**
 * Component-scoped modifier classes that MUI applies to the ROOT element (size /
 * color / variant / orientation variants). They target the styled root itself,
 * so they map to `&.Mui<Comp>-<slot>` (single ampersand, no space) rather than a
 * descendant selector.
 */
const MUI_MODIFIER_SLOT_NAMES = new Set([
  'outlined', 'contained', 'text', 'rounded', 'square', 'fullWidth',
  'disableElevation', 'dense', 'gutters', 'sticky', 'vertical', 'horizontal',
  'flexContainer', 'multiline', 'divider', 'elevation', 'island',
]);

// Modifier slots also follow well-known prefixes (sizeSmall, colorPrimary,
// textSizeSmall, variantOutlined, orientationVertical, edgeStart, positionStatic…).
const MUI_MODIFIER_SLOT_RE = /^(size|color|text|variant|orientation|position|edge|align|padding|margin|spacing)[A-Z]/;

function isModifierSlot(slot) {
  return MUI_MODIFIER_SLOT_NAMES.has(slot) || MUI_MODIFIER_SLOT_RE.test(slot);
}

/**
 * Returns the emotion selector for a given MUI `classes` slot, or `null` when the
 * slot maps to top-level styles (the `root` slot).
 *
 *   root                 → null (top-level)
 *   global state slot    → '&.Mui-<slot>'            (e.g. selected → &.Mui-selected)
 *   root modifier slot   → '&.Mui<Comp>-<slot>'      (e.g. Button+sizeSmall → &.MuiButton-sizeSmall)
 *   child/structural slot→ '& .Mui<Comp>-<slot>'     (e.g. Tabs+indicator → & .MuiTabs-indicator)
 *
 * @param {string} slot - The slot key from a `classes={{ slot: ... }}` prop.
 * @param {string} baseComponent - The wrapped MUI component name (e.g. 'Tabs').
 * @returns {string|null}
 */
function slotToSelector(slot, baseComponent) {
  if (slot === 'root') {
    return null;
  }
  if (MUI_STATE_SLOTS.has(slot)) {
    return `&.Mui-${slot}`;
  }
  if (isModifierSlot(slot)) {
    return `&.Mui${baseComponent}-${slot}`;
  }
  // Structural child slot → descendant of the component's slot class.
  return `& .Mui${baseComponent}-${slot}`;
}

module.exports = {
  MUI_STATE_SLOTS,
  MUI_MODIFIER_SLOT_NAMES,
  isModifierSlot,
  slotToSelector,
};

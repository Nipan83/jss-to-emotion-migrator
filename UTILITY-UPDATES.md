# JSS-to-Emotion Utility Updates

## Overview

This document summarizes the enhancements made to the jss-to-emotion-migrator utility to follow the established patterns from `img-tile-preview-graph.js` and `img-multi-tabs-component.js`.

## Key Updates

### 1. Enhanced Component Naming (`styleNameUtils.js`)

#### Before
- Simple PascalCase conversion
- Limited semantic understanding
- Generic names like `Root`, `Container`

#### After
- **Semantic Mappings**: Intelligent naming based on purpose
- **MUI-Aware**: Recognizes common MUI patterns
- **Descriptive Names**: Generates meaningful component names

**Examples:**

| Class Name | Old Name | New Name | Reason |
|------------|----------|----------|--------|
| `root` | `Root` | `StyledBox` | Better semantics |
| `title` | `Title` | `TitleText` | Indicates Typography |
| `loading` | `Loading` | `LoadingIcon` | Indicates CircularProgress |
| `button` | `Button` | `StyledButton` | Clear component type |
| `notification` | `Notification` | `NotificationBox` | Indicates container |
| `primaryButton` | `PrimaryButton` | `PrimaryButton` | Preserved descriptive name |

**New Semantic Categories:**

```javascript
// Text/Typography patterns
'title' → 'TitleText'
'subtitle' → 'SubtitleText'
'label' → 'LabelText'
'description' → 'DescriptionText'

// Button patterns
'button' → 'StyledButton'
'actionButton' → 'ActionButton'
'submitButton' → 'SubmitButton'

// Icon patterns
'loading' → 'LoadingIcon'
'closeIcon' → 'CloseIcon'

// Layout patterns
'container' → 'StyledBox'
'header' → 'HeaderBox'
'panel' → 'PanelBox'

// Tab patterns
'tabs' → 'StyledTabs'
'tab' → 'StyledTab'
'tabContainer' → 'TabsContainer'

// Card patterns
'card' → 'StyledCard'
'cardContent' → 'CardContentBox'

// Notification patterns
'notification' → 'TrialModeNotification'
'alert' → 'AlertBox'
```

### 2. Improved Element Type Inference

#### Before
- Defaulted to HTML elements (`div`, `span`)
- Limited MUI component recognition

#### After
- **MUI-First Approach**: Prioritizes MUI components
- **Smart Inference**: Based on class name semantics
- **Better Defaults**: Uses `Box` instead of `div`

**Element Type Priority:**

1. **MUI Components** (Preferred)
   ```javascript
   'container' → Box
   'title' → Typography
   'button' → Button
   'loading' → CircularProgress
   'tabs' → Tabs
   'card' → Card
   ```

2. **HTML Elements** (Fallback)
   ```javascript
   'link' → 'a'
   'input' → 'input'
   'form' → 'form'
   ```

3. **Default**: `Box` (instead of `div`)

### 3. Dynamic Props Detection (`styleParser.js`)

Added three new functions to handle dynamic styling:

#### a. `detectUsedProps(j, node)`

Analyzes style objects to find which props are used for dynamic styling.

**Detects:**
- Conditional expressions: `propName ? 'value1' : 'value2'`
- Member access: `props.propName`
- Destructured props in ternaries

**Example:**
```javascript
// Input style object
{
  marginTop: padded ? '110px' : '35px',
  color: props.isActive ? '#fff' : '#000',
}

// Returns: ['padded', 'isActive']
```

#### b. `hasConditionalSpread(j, node)`

Detects spread operators with conditional logic.

**Pattern:**
```javascript
{
  baseStyle: 'value',
  ...condition && {
    additionalStyle: 'value',
  },
}
```

#### c. `usesProps(j, node, propsParamName)`

Enhanced to better detect prop usage throughout style objects.

### 4. Pattern Examples

The utility now handles all patterns from the refactored files:

#### Pattern 1: Simple Static Styled Component

```javascript
// Input (JSS)
const useStyles = makeStyles({
  box: {
    paddingLeft: '15px',
    marginTop: '6px',
  },
});

// Output (Emotion)
const StyledBox = styled(Box)({
  paddingLeft: '15px',
  marginTop: '6px',
});
```

#### Pattern 2: Dynamic Styled Component with Props

```javascript
// Input (JSS)
const useStyles = makeStyles({
  action: {
    marginTop: (props) => props.padded ? '110px' : '35px',
  },
});

// Output (Emotion)
const CategoryAction = styled(Typography)(({ padded }) => ({
  marginTop: padded ? '110px' : '35px',
}));
```

#### Pattern 3: Conditional Spread Styles

```javascript
// Input (JSS)
const useStyles = makeStyles({
  action: {
    position: 'absolute',
    ...(props) => props.padded && {
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
    },
  },
});

// Output (Emotion)
const CategoryAction = styled(Typography)(({ padded }) => ({
  position: 'absolute',
  ...padded && {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
  },
}));
```

#### Pattern 4: MUI Component with Nested Selectors

```javascript
// Input (JSS)
const useStyles = makeStyles({
  tabs: {
    minHeight: 'unset',
    '& .MuiTabs-indicator': {
      display: 'none',
    },
  },
});

// Output (Emotion)
const StyledTabs = styled(Tabs)({
  minHeight: 'unset',
  '& .MuiTabs-indicator': {
    display: 'none',
  },
});
```

#### Pattern 5: State Selectors

```javascript
// Input (JSS)
const useStyles = makeStyles({
  tab: {
    background: '#FAFAFA',
    '&.Mui-selected': {
      background: '#FFF !important',
    },
  },
});

// Output (Emotion)
const StyledTab = styled(Tab)({
  background: '#FAFAFA',
  '&.Mui-selected': {
    background: '#FFF !important',
  },
});
```

## Benefits

### 1. Better Code Quality
- More semantic component names
- Clearer intent through naming
- MUI-first approach for consistency

### 2. Easier Migration
- Automatic detection of patterns
- Proper handling of dynamic styles
- Less manual intervention needed

### 3. Maintainability
- Self-documenting component names
- Consistent naming conventions
- Easier to understand at a glance

### 4. MUI Alignment
- Follows MUI v5 best practices
- Prioritizes MUI components
- Proper use of styled API

## Usage

The utility works exactly the same way, but now produces better output:

```bash
# Preview changes
./jss-to-emotion-migrator/bin/cli.js migrate "src/**/*.js" --dry-run

# Apply migration
./jss-to-emotion-migrator/bin/cli.js migrate "src/**/*.js"

# With MUI pattern (nested selectors)
./jss-to-emotion-migrator/bin/cli.js migrate "src/**/*.js" --mui-pattern
```

## Configuration

### Adding Custom Semantic Mappings

Edit `src/utils/styleNameUtils.js`:

```javascript
const semanticMappings = {
  // Add your custom mappings
  'yourClassName': 'YourStyledComponent',
  'customButton': 'CustomButton',
};
```

### Adding Custom Element Types

Edit `src/utils/styleNameUtils.js`:

```javascript
const muiComponentMappings = {
  // Add your custom component types
  'yourClass': 'YourMuiComponent',
};
```

## Testing

The utility includes comprehensive tests. To run:

```bash
cd jss-to-emotion-migrator
npm test
```

## Compatibility

- **Node**: 14+ (ES6+ support)
- **MUI**: v5.x
- **Emotion**: 11+
- **React**: 16.8+ (hooks)

## Migration Checklist

When migrating with the updated utility:

- [ ] Run with `--dry-run` first to preview
- [ ] Review generated component names
- [ ] Check props are properly detected for dynamic styles
- [ ] Verify MUI components are used appropriately
- [ ] Test the component visually
- [ ] Run your test suite
- [ ] Check for any remaining JSS imports

## Known Limitations

1. **Complex Computed Styles**: Very complex style functions may need manual review
2. **Multiple Props in One Condition**: Complex boolean logic might need adjustment
3. **Dynamic Class Names**: Runtime class name generation needs manual handling
4. **CSS Variables**: May need manual review for proper handling

## Future Enhancements

Potential improvements for future versions:

- [ ] Support for CSS-in-JS libraries beyond Emotion
- [ ] More sophisticated prop type inference
- [ ] Automatic PropTypes generation for styled components
- [ ] Theme variable extraction and mapping
- [ ] Automated testing of migrated components

## References

- **Example Files**:
  - `src/app/overview/components/tile-view/components/img-tile-preview-graph.js`
  - `src/app/workplan/multi-tabs/img-multi-tabs-component.js`

- **Related Documentation**:
  - [MIGRATION-PATTERNS.md](./MIGRATION-PATTERNS.md)
  - [MUI-MIGRATION-GUIDE.md](./MUI-MIGRATION-GUIDE.md)
  - [README.md](./README.md)

## Support

For issues or questions:
1. Check the documentation files
2. Review example files in the codebase
3. Examine the utility source code
4. Create an issue with detailed context

## Changelog

### Version 2.0.0 (Current)
- ✅ Enhanced semantic naming for styled components
- ✅ MUI-first element type inference
- ✅ Dynamic props detection
- ✅ Conditional spread support
- ✅ Better handling of complex styles
- ✅ Comprehensive pattern documentation

### Version 1.0.0 (Previous)
- Basic JSS to Emotion transformation
- Simple component naming
- Basic element type inference

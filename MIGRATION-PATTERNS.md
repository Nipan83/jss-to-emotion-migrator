# JSS to Emotion Migration Patterns

> **Note:** As of version 2.1.0, this tool uses the MUI-recommended pattern by default (PREFIX + classes + nested selectors). For the current migration approach, see [MUI-MIGRATION-GUIDE.md](./MUI-MIGRATION-GUIDE.md).

This guide documents legacy migration patterns based on individual styled components. These patterns are preserved for reference but are no longer used by the tool.

## Overview

The migration utility now transforms JSS styles (makeStyles, withStyles) to Emotion styled components using MUI's recommended pattern with PREFIX, classes object, and nested selectors.

## Core Patterns

### 1. Import Pattern

**Before (JSS):**
```javascript
import { makeStyles } from '@mui/styles';
```

**After (Emotion):**
```javascript
import { styled } from '@mui/material/styles';
import { Box, Typography, Button } from '@mui/material';
```

### 2. Styled Components Creation

#### a. Simple Static Styles

**Before:**
```javascript
const useStyles = makeStyles({
  container: {
    paddingLeft: '15px',
    marginTop: '6px',
    display: 'inline-flex',
  },
});
```

**After:**
```javascript
const StyledBox = styled(Box)({
  paddingLeft: '15px',
  marginTop: '6px',
  display: 'inline-flex',
});
```

#### b. Styles with Props (Dynamic Styling)

**Before:**
```javascript
const useStyles = makeStyles({
  button: {
    position: 'absolute',
    right: 0,
    bottom: (props) => props.trialMode ? '25px' : '10px',
  },
});
```

**After:**
```javascript
const InvestigateButton = styled(Button)(({ trialMode }) => ({
  position: 'absolute',
  right: 0,
  bottom: trialMode ? '25px' : '10px',
}));
```

#### c. Conditional Styles with Spread

**Before:**
```javascript
const useStyles = makeStyles({
  action: {
    position: 'absolute',
    marginTop: (props) => props.padded ? '110px' : '35px',
    ...(props) => props.padded && {
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
    },
  },
});
```

**After:**
```javascript
const CategoryAction = styled(Typography)(({ padded }) => ({
  position: 'absolute',
  marginTop: padded ? '110px' : '35px',
  ...padded && {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
  },
}));
```

### 3. Nested Selectors (MUI Classes)

**Before:**
```javascript
const useStyles = makeStyles({
  tabs: {
    minHeight: 'unset',
    '& .MuiTabs-indicator': {
      display: 'none',
    },
  },
});
```

**After:**
```javascript
const StyledTabs = styled(Tabs)({
  minHeight: 'unset',
  '& .MuiTabs-indicator': {
    display: 'none',
  },
});
```

### 4. Pseudo-classes and State Selectors

**Before:**
```javascript
const useStyles = makeStyles({
  tab: {
    background: '#FAFAFA',
    '&.Mui-selected': {
      background: '#FFF !important',
    },
  },
});
```

**After:**
```javascript
const StyledTab = styled(Tab)({
  background: '#FAFAFA',
  '&.Mui-selected': {
    background: '#FFF !important',
  },
});
```

## Component Naming Conventions

The utility automatically generates semantic names based on class names:

| JSS Class Name | Styled Component Name | Base Component |
|----------------|----------------------|----------------|
| `root` | `StyledBox` | `Box` |
| `container` | `StyledBox` | `Box` |
| `title` | `TitleText` | `Typography` |
| `subtitle` | `SubtitleText` | `Typography` |
| `button` | `StyledButton` | `Button` |
| `loading` | `LoadingIcon` | `CircularProgress` |
| `tab` | `StyledTab` | `Tab` |
| `tabs` | `StyledTabs` | `Tabs` |
| `notification` | `NotificationBox` | `Box` |
| `card` | `StyledCard` | `Card` |

For descriptive names like `primaryButton`, it preserves the name as `PrimaryButton`.

## Element Type Inference

The utility infers the appropriate MUI component or HTML element:

### MUI Components (Preferred)
- Box → for containers, wrappers
- Typography → for text elements (title, label, description)
- Button → for buttons
- CircularProgress → for loading indicators
- Card → for card containers
- Tabs/Tab → for tab components

### HTML Elements (Fallback)
- `div`, `span`, `a`, `button`, etc. for non-MUI cases

## Usage in JSX

### Simple Replacement

**Before:**
```javascript
const MyComponent = () => {
  const classes = useStyles();

  return (
    <div className={classes.container}>
      <span className={classes.title}>Title</span>
    </div>
  );
};
```

**After:**
```javascript
const MyComponent = () => {
  return (
    <StyledBox>
      <TitleText>Title</TitleText>
    </StyledBox>
  );
};
```

### With Props

**Before:**
```javascript
const MyComponent = ({ isActive }) => {
  const classes = useStyles({ isActive });

  return (
    <button className={classes.button}>Click</button>
  );
};
```

**After:**
```javascript
const MyComponent = ({ isActive }) => {
  return (
    <StyledButton isActive={isActive}>Click</StyledButton>
  );
};
```

### Preserving Other Props

**Before:**
```javascript
<Button className={classes.submitButton} onClick={handleClick} disabled={isLoading}>
  Submit
</Button>
```

**After:**
```javascript
<SubmitButton onClick={handleClick} disabled={isLoading}>
  Submit
</SubmitButton>
```

## Migration Workflow

### 1. Automatic Migration

```bash
# Dry run to preview changes
jss-to-emotion migrate "src/app/**/*.js" --dry-run

# Apply migration (uses MUI pattern by default)
jss-to-emotion migrate "src/app/**/*.js"
```

See [MUI-MIGRATION-GUIDE.md](./MUI-MIGRATION-GUIDE.md) for the current migration pattern details.

### 2. What Gets Transformed

✅ **Automatically Handled:**
- Import statements (`makeStyles`, `withStyles` → `styled`)
- Style object extraction
- Styled component creation with appropriate names
- JSX element replacement
- Props detection for dynamic styles
- Theme parameter handling
- Removal of `useStyles()` calls
- Removal of `classes` prop from components

✅ **Preserved:**
- Regular `className` for non-JSS classes
- `classNames()` utility usage
- Inline `style` props
- PropTypes
- Other component logic

### 3. Manual Review Required

⚠️ **Check These Cases:**
- Complex conditional styles
- `clsx`/`classnames` with multiple JSS classes
- Styles that reference other class names
- Media queries and breakpoints
- Keyframe animations

## Common Patterns

### Pattern 1: Box with Typography

```javascript
// Before
const useStyles = makeStyles({
  container: { padding: '20px' },
  title: { fontSize: '24px', color: '#333' },
});

// After
const StyledBox = styled(Box)({
  padding: '20px',
});

const TitleText = styled(Typography)({
  fontSize: '24px',
  color: '#333',
});
```

### Pattern 2: Dynamic Button Styles

```javascript
// Before
const useStyles = makeStyles({
  button: {
    color: (props) => props.isPrimary ? '#fff' : '#000',
    backgroundColor: (props) => props.isPrimary ? '#1976d2' : 'transparent',
  },
});

// After
const StyledButton = styled(Button)(({ isPrimary }) => ({
  color: isPrimary ? '#fff' : '#000',
  backgroundColor: isPrimary ? '#1976d2' : 'transparent',
}));
```

### Pattern 3: MUI Component Overrides

```javascript
// Before
const useStyles = makeStyles({
  tabs: {
    '& .MuiTabs-indicator': { display: 'none' },
    '& .MuiTabs-scroller': { zIndex: 1 },
  },
});

// After
const StyledTabs = styled(Tabs)({
  '& .MuiTabs-indicator': { display: 'none' },
  '& .MuiTabs-scroller': { zIndex: 1 },
});
```

### Pattern 4: Conditional Spread Styles

```javascript
// Before
const useStyles = makeStyles({
  text: {
    color: '#333',
    ...(props) => props.truncate && {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
  },
});

// After
const StyledText = styled(Typography)(({ truncate }) => ({
  color: '#333',
  ...truncate && {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
}));
```

## Best Practices

1. **Placement**: Define styled components at the top of the file, before the main component
2. **Naming**: Use descriptive, semantic names (e.g., `LoadingIcon` not `StyledDiv`)
3. **Props**: Destructure only the props you need: `({ propName }) => ({...})`
4. **Base Components**: Prefer MUI components (Box, Typography) over HTML elements
5. **Nesting**: Use nested selectors for MUI class overrides
6. **Specificity**: Use `!important` sparingly; leverage CSS specificity instead

## Troubleshooting

### Issue: Styles not applying

**Check:**
1. Import statement includes the base component
2. Props are properly passed to styled component
3. Nested selectors use correct syntax

### Issue: Type errors with props

**Solution:** Add prop to styled component's type if using TypeScript:
```typescript
const StyledButton = styled(Button)<{ customProp: boolean }>(...)
```

### Issue: Theme not available

**Ensure:** Component is wrapped with ThemeProvider at app level

## Examples from Codebase

See these files for reference implementations:
- [img-tile-preview-graph.js](src/app/overview/components/tile-view/components/img-tile-preview-graph.js)
- [img-multi-tabs-component.js](src/app/workplan/multi-tabs/img-multi-tabs-component.js)

## Additional Resources

- [MUI v5 Migration Guide](https://mui.com/material-ui/migration/migration-v4/)
- [Emotion Documentation](https://emotion.sh/docs/introduction)
- [MUI Styled API](https://mui.com/system/styled/)

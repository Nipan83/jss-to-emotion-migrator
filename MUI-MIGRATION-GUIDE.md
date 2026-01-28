# MUI-Recommended Migration Pattern

This guide explains the MUI-recommended migration pattern used by the jss-to-emotion-migrator tool.

## Overview

This tool implements the migration strategy recommended by MUI's official migration guide. Instead of creating individual styled components for each class, it creates:

1. **PREFIX constant** - Component name prefix for class names
2. **classes object** - Maintains backward compatibility with existing JSX
3. **Root styled component** - Single component with nested CSS selectors
4. **Automatic JSX wrapping** - Automatically wraps your component's return statements with `<Root>`

## Example Migration

### Before (JSS with makeStyles)

```javascript
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles({
  container: {
    height: '100%',
    backgroundColor: '#F5F5F5',
  },
  title: {
    color: '#000',
    fontFamily: 'Roboto',
  },
});

const MyComponent = () => {
  const classes = useStyles();

  return (
    <Paper classes={{ root: classes.container }}>
      <Typography classes={{ root: classes.title }}>
        Hello World
      </Typography>
    </Paper>
  );
};
```

### After (Emotion with MUI Pattern)

```javascript
import { styled } from '@mui/material/styles';

const PREFIX = 'MyComponent';

const classes = {
  container: `${PREFIX}-container`,
  title: `${PREFIX}-title`,
};

const Root = styled('div')({
  [`& .${classes.container}`]: {
    height: '100%',
    backgroundColor: '#F5F5F5',
  },
  [`& .${classes.title}`]: {
    color: '#000',
    fontFamily: 'Roboto',
  },
});

const MyComponent = () => {
  // JSX is automatically wrapped with <Root> - no manual changes needed!
  return (
    <Root>
      <Paper classes={{ root: classes.container }}>
        <Typography classes={{ root: classes.title }}>
          Hello World
        </Typography>
      </Paper>
    </Root>
  );
};
```

## What the Tool Does Automatically

The migration tool handles everything automatically:

1. ✅ Creates PREFIX constant
2. ✅ Creates classes object
3. ✅ Creates Root styled component with nested selectors
4. ✅ Wraps your component's JSX return statements with `<Root>`
5. ✅ Removes old makeStyles/useStyles code
6. ✅ Updates imports

**No manual intervention required!** Your existing JSX with `classes` prop continues to work as-is.

## Optional Manual Step: Root Class

If you had a `root` class in your styles and want to apply it to the Root component itself, you can add the className:

```javascript
const Root = styled('div')({
  [`&.${classes.root}`]: {  // root uses &. instead of & .
    display: 'flex',
    padding: 20,
  },
  [`& .${classes.title}`]: {  // nested classes use & .
    color: '#000',
  },
});

// In your JSX
return (
  <Root className={classes.root}>
    <Typography className={classes.title}>Title</Typography>
  </Root>
);
```

## Benefits of This Approach

1. **Minimal JSX Changes** - The `classes` object continues to work exactly as before
2. **Backward Compatible** - Existing className and classes prop usage remains unchanged
3. **MUI Components Work** - The `classes` prop pattern works with all MUI components
4. **Single Styled Component** - Reduces component proliferation
5. **CSS Specificity** - Uses nested selectors for proper style scoping

## Usage

### Basic Command

```bash
jss-to-emotion migrate "src/**/*.js" --dry-run
```

### With Other Options

```bash
# Include only specific files
jss-to-emotion migrate "src/**/*.js" --include "overview"

# Skip confirmation
jss-to-emotion migrate "src/**/*.js" -y
```

## Troubleshooting

### Styles Not Applying

If styles aren't applying after migration:

1. **Check if you wrapped with Root** - The most common issue
   ```javascript
   return <Root>{/* your JSX */}</Root>
   ```

2. **Check computed property syntax** - Should have brackets
   ```javascript
   [`& .${classes.title}`]: { /* styles */ }  // ✓ Correct
   `& .${classes.title}`: { /* styles */ }    // ✗ Wrong
   ```

3. **Check class name format** - Should use template literal
   ```javascript
   const classes = {
     title: `${PREFIX}-title`  // ✓ Correct
   };
   ```

### Root vs Nested Selectors

- **Root class** (`&.${classes.root}`): Applied to the Root component itself
- **Nested classes** (`& .${classes.title}`): Applied to children inside Root

```javascript
const Root = styled('div')({
  // Styles applied to <Root> itself
  [`&.${classes.root}`]: {
    display: 'flex',
  },

  // Styles applied to elements inside <Root>
  [`& .${classes.title}`]: {
    color: '#000',
  },
});
```

## Migration Checklist

- [ ] Run migration with `--dry-run` to preview
- [ ] Review the generated PREFIX and classes object
- [ ] Apply the migration without `--dry-run`
- [ ] Test the component visually (JSX is automatically wrapped!)
- [ ] Run tests to ensure functionality
- [ ] Clean up unused imports with cleanup command if needed

## Additional Resources

- [MUI Migration Guide](https://mui.com/material-ui/migration/migration-v4/)
- [Emotion Documentation](https://emotion.sh/docs/introduction)
- [Styled Components API](https://emotion.sh/docs/styled)

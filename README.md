# jss-to-emotion-migrator

[![npm version](https://img.shields.io/npm/v/jss-to-emotion-migrator.svg)](https://www.npmjs.com/package/jss-to-emotion-migrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful codemod tool to migrate JSS styles (`makeStyles`, `withStyles`, `createStyles`) to Emotion using MUI's `styled()` API.

## Why This Tool?

MUI's official codemod handles basic migrations but requires manual intervention for:
- **External style definitions** - styles defined in separate files or outside components
- **Complex style patterns** - nested styles, theme-aware styles, conditional classes

This tool handles these edge cases automatically, making large-scale migrations much easier.

## Features

### Core Features
- ✅ **Automatic Migration** - Converts `makeStyles` and `withStyles` to `styled()` components
- ✅ **External Style Support** - Handles styles defined in separate files
- ✅ **Theme-Aware** - Preserves theme dependencies in styled components
- ✅ **Cleanup Tool** - Removes unused JSS imports and dead code files
- ✅ **Dry Run Mode** - Preview changes before applying them
- ✅ **Incremental Migration** - Filter files with `--include`/`--exclude` patterns
- ✅ **CI/CD Ready** - Non-interactive mode with `--yes` flag

### Enhanced Features (v2.0+)
- ✨ **Semantic Component Naming** - Generates meaningful names (e.g., `TitleText`, `LoadingIcon`, `StyledButton`)
- ✨ **MUI-First Approach** - Prioritizes MUI components (Box, Typography) over HTML elements
- ✨ **Dynamic Props Detection** - Automatically detects and handles prop-based styling
- ✨ **Conditional Spread Support** - Preserves `...condition && { styles }` patterns
- ✨ **Smart Element Inference** - Detects appropriate MUI components from class names
- ✨ **Pattern Recognition** - Follows established codebase patterns automatically

## Installation

```bash
# Install globally
npm install -g jss-to-emotion-migrator

# Or use npx
npx jss-to-emotion-migrator migrate "src/**/*.jsx"

# Or install as dev dependency
npm install --save-dev jss-to-emotion-migrator
```

## Quick Start

### 1. Preview Changes (Recommended First Step)

```bash
# See what would be migrated without making changes
jss-to-emotion migrate "src/**/*.{js,jsx,ts,tsx}" --dry-run
```

### 2. Run Migration

```bash
# Migrate all files
jss-to-emotion migrate "src/**/*.{js,jsx,ts,tsx}"

# Migrate specific directories
jss-to-emotion migrate "src/components/**/*.jsx" "src/pages/**/*.jsx"
```

### 3. Clean Up

```bash
# Remove unused JSS imports
jss-to-emotion cleanup "src/**/*.{js,jsx,ts,tsx}"

# Also delete dead style files
jss-to-emotion cleanup "src/**/*.{js,jsx,ts,tsx}" --delete-dead-files
```

## CLI Reference

### `migrate` Command

Migrate JSS styles to Emotion styled API.

```bash
jss-to-emotion migrate <patterns...> [options]
```

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--dry-run` | Preview changes without modifying files | `false` |
| `-p, --parser <parser>` | Parser to use (`babel`, `tsx`, `flow`) | `babel` |
| `-t, --transform <name>` | Transform to use (`jssToEmotion`, `makeStyles`, `withStyles`) | `jssToEmotion` |
| `-v, --verbose` | Show detailed output | `false` |
| `-y, --yes` | Skip confirmation prompts | `false` |
| `-i, --include <pattern>` | Regex to include files (repeatable) | `[]` |
| `-e, --exclude <pattern>` | Regex to exclude files (repeatable) | `[]` |
| `--ignore <patterns>` | Glob patterns to ignore (comma-separated) | `node_modules/**,dist/**,build/**` |
| `--list` | List matching files without processing | `false` |
| `--cleanup` | Also run cleanup after migration | `false` |

### `cleanup` Command

Remove unused JSS imports and dead code files.

```bash
jss-to-emotion cleanup <patterns...> [options]
```

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--dry-run` | Preview changes without modifying files | `false` |
| `--delete-dead-files` | Delete files containing only JSS code | `false` |
| `--list` | List files and their cleanup status | `false` |
| `-v, --verbose` | Show detailed output | `false` |
| `-y, --yes` | Skip confirmation prompts | `false` |
| Other options | Same as migrate command | - |

## Transformation Examples

### makeStyles → styled

**Before:**
```jsx
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles((theme) => ({
  root: {
    backgroundColor: theme.palette.primary.main,
    padding: theme.spacing(2),
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
}));

function MyComponent() {
  const classes = useStyles();
  return (
    <div className={classes.root}>
      <h1 className={classes.title}>Hello</h1>
    </div>
  );
}
```

**After:**
```jsx
import { styled } from '@mui/material/styles';

const Root = styled('div')(({ theme }) => ({
  backgroundColor: theme.palette.primary.main,
  padding: theme.spacing(2),
}));

const Title = styled('h1')({
  fontSize: 24,
  fontWeight: 'bold',
});

function MyComponent() {
  return (
    <Root>
      <Title>Hello</Title>
    </Root>
  );
}
```

### withStyles → styled

**Before:**
```jsx
import { withStyles } from '@material-ui/core/styles';

const styles = (theme) => ({
  root: { padding: theme.spacing(2) },
  header: { marginBottom: theme.spacing(1) },
});

function Card({ classes, children }) {
  return (
    <div className={classes.root}>
      <h2 className={classes.header}>Title</h2>
      {children}
    </div>
  );
}

export default withStyles(styles)(Card);
```

**After:**
```jsx
import { styled } from '@mui/material/styles';

const Root = styled('div')(({ theme }) => ({
  padding: theme.spacing(2),
}));

const Header = styled('h2')(({ theme }) => ({
  marginBottom: theme.spacing(1),
}));

function Card({ children }) {
  return (
    <Root>
      <Header>Title</Header>
      {children}
    </Root>
  );
}

export default Card;
```

## Programmatic API

You can also use this tool programmatically:

```javascript
const { migrate, cleanup, analyzeForCleanup } = require('jss-to-emotion-migrator');

// Migrate source code
const source = `
  import { makeStyles } from '@material-ui/core/styles';
  // ... your code
`;

const result = migrate(source, {
  parser: 'babel',        // 'babel' | 'tsx' | 'flow'
  transform: 'jssToEmotion',
  filePath: 'MyComponent.jsx',
});

console.log(result); // Transformed source code

// Cleanup unused imports
const cleanupResult = cleanup(result, {
  parser: 'babel',
});

console.log(cleanupResult.source); // Cleaned source
console.log(cleanupResult.report); // { removedImports: [...], isDead: false }

// Analyze without modifying
const analysis = analyzeForCleanup(source, { parser: 'babel' });
console.log(analysis);
// {
//   unusedJSSImports: ['makeStyles'],
//   unusedStyleDeclarations: ['useStyles'],
//   isDead: false,
//   deadReason: ''
// }
```

## Incremental Migration

For large codebases, migrate incrementally:

```bash
# Migrate only Button components first
jss-to-emotion migrate "src/**/*.jsx" --include "Button"

# Migrate specific directories
jss-to-emotion migrate "src/**/*.jsx" --include "components/forms"

# Exclude test files
jss-to-emotion migrate "src/**/*.jsx" --exclude "\.test\." --exclude "\.spec\."

# Combine patterns
jss-to-emotion migrate "src/**/*.jsx" \
  --include "components" \
  --exclude "legacy" \
  --exclude "\.test\."
```

## CI/CD Integration

```bash
# Non-interactive mode for CI/CD pipelines
jss-to-emotion migrate "src/**/*.jsx" --yes

# Dry run in CI to verify no unintended changes
jss-to-emotion migrate "src/**/*.jsx" --dry-run --yes
```

## Best Practices

1. **Always run with `--dry-run` first** to preview changes
2. **Commit your code** before running the migration
3. **Run your tests** after migration to catch any issues
4. **Migrate incrementally** for large codebases
5. **Review the changes** - some edge cases may need manual adjustment

## Troubleshooting

### TypeScript Files Not Parsing

Make sure to use the correct parser:

```bash
jss-to-emotion migrate "src/**/*.tsx" --parser tsx
```

### Some Files Skipped

Files are skipped if they don't contain JSS patterns. Use `--verbose` to see details:

```bash
jss-to-emotion migrate "src/**/*.jsx" --verbose
```

### Errors During Migration

Check the error details and file:

```bash
jss-to-emotion migrate "src/**/*.jsx" --verbose
```

## Documentation

### Comprehensive Guides

- **[MIGRATION-PATTERNS.md](./MIGRATION-PATTERNS.md)** - Complete guide to all migration patterns and JSX transformations
- **[UTILITY-UPDATES.md](./UTILITY-UPDATES.md)** - Detailed documentation of v2.0 enhancements and improvements
- **[BEFORE-AFTER-EXAMPLES.md](./BEFORE-AFTER-EXAMPLES.md)** - Real-world before/after examples with explanations
- **[MUI-MIGRATION-GUIDE.md](./MUI-MIGRATION-GUIDE.md)** - MUI-specific migration patterns (nested selectors approach)

### Quick Reference

**Component Naming:**
- `root` / `container` → `StyledBox`
- `title` / `heading` → `TitleText`
- `button` → `StyledButton`
- `loading` → `LoadingIcon`
- `tabs` → `StyledTabs`

**Element Inference:**
- Container classes → `Box`
- Text classes → `Typography`
- Button classes → `Button`
- Loading classes → `CircularProgress`

**Dynamic Styling:**
```javascript
// Automatically detected and transformed
const StyledComponent = styled(Component)(({ propName }) => ({
  property: propName ? 'value1' : 'value2',
  ...propName && { additionalStyles },
}));
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history and updates.

## License

MIT © [jss-to-emotion-migrator](LICENSE)

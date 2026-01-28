# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-01

### Added

- Initial release
- `migrate` command to convert JSS to Emotion styled API
  - Support for `makeStyles` transformation
  - Support for `withStyles` transformation
  - Support for external style definitions
  - Theme-aware styled components generation
  - Smart HTML element type inference from JSX usage
- `cleanup` command to remove unused JSS code
  - Detection and removal of unused JSS imports
  - Detection and removal of unused style declarations
  - Dead file detection (files containing only JSS code)
  - `--delete-dead-files` option to remove dead files
- `--dry-run` mode to preview changes without modifying files
- Incremental migration support with `--include`/`--exclude` patterns
- Verbose output mode for debugging
- Non-interactive mode (`--yes`) for CI/CD pipelines
- TypeScript file support with `--parser tsx`
- Programmatic API for custom integrations
- Comprehensive test suite

### Technical Details

- Built with jscodeshift for robust AST transformations
- Uses commander.js for CLI argument parsing
- Colorful terminal output with chalk
- Glob pattern matching for file selection

## [2.0.0] - 2026-01-20

### Added - Major Release: Fully Automated Migration! 🎉

#### Automatic JSX Wrapping
- **Zero manual intervention required!** The `--mui-pattern` migration now automatically wraps component JSX return statements with the `<Root>` component
- Intelligently identifies all component functions (function declarations, arrow functions, export default)
- Only wraps components that actually use the `classes` variable
- Handles all return statement patterns:
  - Direct JSX returns: `return <Paper>...</Paper>`
  - Conditional returns: `return condition ? <ComponentA /> : <ComponentB />`
  - Logical expressions: `return isReady && <Component />`
  - JSX fragments: `return <>{content}</>`
- Prevents double-wrapping with Root component detection
- Adds proper whitespace for readable, well-formatted output

### Fixed

- Fixed jscodeshift/recast adding extra parentheses around wrapped JSX elements
  - Solution: Added JSXText whitespace nodes as siblings to prevent incorrect parenthesization
  - This was a known recast behavior when single JSX elements are children
- Fixed AST type safety issues where code assumed `id` was always an Identifier
  - Added proper type guards for destructuring patterns (ObjectPattern, ArrayPattern)
  - Prevents `Cannot read properties of undefined (reading 'endsWith')` errors

### Changed

- Updated MUI-MIGRATION-GUIDE.md to reflect automatic wrapping
  - Removed "Manual Steps Required" section
  - Updated examples to show automatic output
  - Simplified migration checklist
- Migration is now truly one-command with zero post-processing

### Technical Details

**Implementation:**
- New `wrapComponentReturnsWithRoot()` function analyzes component structure
- Uses JSXText nodes for proper formatting (prevents recast parenthesization)
- Preserves all existing JSX and class references unchanged
- Tested on 5 real-world components from imaging-fe project

**Impact:**
- Before: Manual editing required for every migrated component
- After: Fully automated - ready for immediate testing

## [2.1.0] - 2026-01-28

### Added

- MUI-recommended pattern (PREFIX + classes + nested selectors) is now the default migration approach
- Simplified CLI interface for easier usage

### Changed

- The `--mui-pattern` flag is no longer needed as this pattern is now the default behavior
- The `-t, --transform` option has been streamlined - tool now uses `jssToEmotionMUI` as the default
- Updated all documentation to reflect the simplified approach

### Improved

- Clearer migration path with a single, well-tested pattern
- Reduced confusion by focusing on the most reliable migration strategy
- Better alignment with MUI's official migration recommendations

### Usage Notes

The tool now defaults to the MUI-recommended pattern, which has proven to be the most reliable and maintainable approach for migrating JSS to Emotion, especially for codebases with heavy MUI component usage.

**Command usage remains the same:**
```bash
jss-to-emotion-migrator migrate "src/**/*.js"
```

The `--mui-pattern` flag is still accepted but is no longer necessary.

## [2.1.1] - 2026-01-28

### Fixed

- Corrected CLI binary name references in documentation from `./jss-to-emotion-migrator/bin/cli.js` to `jss-to-emotion`
- Updated UPDATES-SUMMARY.md and UTILITY-UPDATES.md with correct command examples

## [2.1.2] - 2026-01-28

### Fixed

- Corrected binary name in package.json from `jss-to-emotion` to `jss-to-emotion-migrator` to match package name
- Updated all documentation to use correct CLI command `jss-to-emotion-migrator`

## [Unreleased]

### Planned

- Support for `createStyles` as standalone transform
- Support for dynamic class name generation
- Better handling of spread operators in style objects
- VS Code extension integration

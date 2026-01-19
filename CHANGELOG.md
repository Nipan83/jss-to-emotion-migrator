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

## [Unreleased]

### Planned

- Support for `createStyles` as standalone transform
- Support for nested style selectors
- Support for dynamic class name generation
- Better handling of spread operators in style objects
- VS Code extension integration

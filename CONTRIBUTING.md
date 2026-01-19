# Contributing to jss-to-emotion-migrator

Thank you for your interest in contributing to jss-to-emotion-migrator! This document provides guidelines and instructions for contributing.

## Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/user/jss-to-emotion-migrator.git
   cd jss-to-emotion-migrator
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run tests**

   ```bash
   npm test
   ```

4. **Run tests in watch mode**

   ```bash
   npm run test:watch
   ```

## Project Structure

```
jss-to-emotion-migrator/
├── bin/
│   └── cli.js              # CLI entry point
├── src/
│   ├── index.js            # Main API exports
│   ├── index.d.ts          # TypeScript definitions
│   ├── transforms/         # jscodeshift transforms
│   │   ├── index.js
│   │   ├── jssToEmotion.js # Combined transform
│   │   ├── makeStyles.js   # makeStyles transform
│   │   ├── withStyles.js   # withStyles transform
│   │   └── cleanupJSS.js   # Cleanup transform
│   └── utils/              # Utility functions
│       ├── index.js
│       ├── importHandler.js
│       ├── jsxTransformer.js
│       ├── styleParser.js
│       └── styleNameUtils.js
├── tests/
│   ├── transforms.test.js  # Test suite
│   ├── fixtures/           # Test input/output files
│   └── cleanup-fixtures/   # Cleanup test fixtures
├── package.json
├── README.md
├── LICENSE
├── CHANGELOG.md
└── CONTRIBUTING.md
```

## How to Contribute

### Reporting Bugs

1. Search existing issues to avoid duplicates
2. Create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Code samples if applicable
   - Node.js and npm versions

### Suggesting Features

1. Search existing issues/discussions
2. Create a new issue with:
   - Clear description of the feature
   - Use cases and benefits
   - Possible implementation approach

### Submitting Pull Requests

1. **Fork the repository**

2. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**

   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed

4. **Run tests**

   ```bash
   npm test
   ```

5. **Commit your changes**

   ```bash
   git commit -m "feat: add your feature description"
   ```

   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `docs:` - Documentation changes
   - `test:` - Test changes
   - `refactor:` - Code refactoring
   - `chore:` - Maintenance tasks

6. **Push and create PR**

   ```bash
   git push origin feature/your-feature-name
   ```

   Then create a Pull Request on GitHub.

## Adding New Transforms

1. Create a new file in `src/transforms/`
2. Export the transform function following jscodeshift patterns
3. Add the transform to `src/transforms/index.js`
4. Add tests in `tests/transforms.test.js`
5. Add fixtures in `tests/fixtures/`

Example transform structure:

```javascript
/**
 * Transform description
 * @param {object} fileInfo - jscodeshift file info
 * @param {object} api - jscodeshift API
 * @param {object} options - Transform options
 * @returns {string} - Transformed source
 */
function myTransform(fileInfo, api, options) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  
  // Your transformation logic here
  
  return root.toSource();
}

module.exports = myTransform;
```

## Testing

- Write tests for all new functionality
- Include both positive and negative test cases
- Use fixtures for complex transformations
- Run full test suite before submitting PR

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- --testNamePattern="your test name"
```

## Code Style

- Use 2-space indentation
- Use single quotes for strings
- Add JSDoc comments for functions
- Keep functions focused and small
- Use meaningful variable names

## Questions?

Feel free to open an issue for any questions about contributing.

Thank you for contributing! 🎉

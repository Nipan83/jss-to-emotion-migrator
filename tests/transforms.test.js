/**
 * Tests for JSS to Emotion transforms
 */

const fs = require('fs');
const path = require('path');
const { migrate } = require('../src');

const fixturesDir = path.join(__dirname, 'fixtures');

// Helper to normalize code for comparison (remove extra whitespace, etc.)
function normalizeCode(code) {
  return code
    .replace(/\r\n/g, '\n')
    .trim();
}

// Helper to read fixture files
function readFixture(name) {
  const inputPath = path.join(fixturesDir, `${name}.input.js`);
  const outputPath = path.join(fixturesDir, `${name}.output.js`);
  
  return {
    input: fs.readFileSync(inputPath, 'utf-8'),
    expectedOutput: fs.readFileSync(outputPath, 'utf-8'),
  };
}

describe('JSS to Emotion Migrator', () => {
  describe('makeStyles transform', () => {
    test('should transform basic makeStyles with theme', () => {
      const { input, expectedOutput } = readFixture('makeStyles-basic');
      const result = migrate(input, {
        parser: 'babel',
        transform: 'jssToEmotion',
      });
      
      // The result should contain key elements
      expect(result).toContain("import { styled } from '@mui/material/styles'");
      expect(result).toContain("const StyledBox = styled('div')");
      expect(result).toContain("const LabelText = styled('span')");
      expect(result).not.toContain('makeStyles');
      expect(result).not.toContain('useStyles');
      expect(result).not.toContain('classes.root');
      expect(result).not.toContain('classes.label');
      expect(result).toContain('<StyledBox>');
      expect(result).toContain('<LabelText>');
    });
    
    test('should transform makeStyles with external style definitions', () => {
      const { input, expectedOutput } = readFixture('makeStyles-external');
      const result = migrate(input, {
        parser: 'babel',
        transform: 'jssToEmotion',
      });
      
      expect(result).toContain("import { styled } from '@mui/material/styles'");
      expect(result).toContain("const StyledBox = styled('div')");
      expect(result).toContain("const TitleText = styled('h2')");
      expect(result).toContain("const StyledButton = styled('button')");
      expect(result).not.toContain('const styles =');
      expect(result).not.toContain('makeStyles');
      expect(result).not.toContain('useStyles');
    });
    
    test('should transform makeStyles without theme', () => {
      const { input, expectedOutput } = readFixture('makeStyles-noTheme');
      const result = migrate(input, {
        parser: 'babel',
        transform: 'jssToEmotion',
      });
      
      expect(result).toContain("import { styled } from '@mui/material/styles'");
      expect(result).toContain("const StyledBox = styled('div')");
      expect(result).toContain("const StyledText = styled('p')");
      // Should not have theme destructuring for static styles
      expect(result).not.toContain('makeStyles');
      expect(result).not.toContain('useStyles');
    });
  });
  
  describe('withStyles transform', () => {
    test('should transform withStyles HOC', () => {
      const { input, expectedOutput } = readFixture('withStyles');
      const result = migrate(input, {
        parser: 'babel',
        transform: 'jssToEmotion',
      });
      
      expect(result).toContain("import { styled } from '@mui/material/styles'");
      expect(result).toContain("const StyledBox = styled(Box)");
      expect(result).not.toContain('withStyles');
      expect(result).not.toContain('classes');
      // Should remove the HOC wrapping
      expect(result).toContain('export default Panel');
    });
  });
  
  describe('edge cases', () => {
    test('should not modify files without JSS imports', () => {
      const input = `
import React from 'react';

function Component() {
  return <div>Hello</div>;
}

export default Component;
`;
      
      const result = migrate(input, {
        parser: 'babel',
        transform: 'jssToEmotion',
      });
      
      expect(result).toBe(input);
    });
    
    test('should handle named imports correctly', () => {
      const input = `
import React from 'react';
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles({
  root: { color: 'red' },
});

function Test() {
  const classes = useStyles();
  return <div className={classes.root}>Test</div>;
}

export default Test;
`;
      
      const result = migrate(input, {
        parser: 'babel',
        transform: 'jssToEmotion',
      });
      
      expect(result).toContain("import { styled } from '@mui/material/styles'");
      expect(result).toContain("const StyledBox = styled('div')");
      expect(result).not.toContain('makeStyles');
    });
  });
});

describe('Utility functions', () => {
  const utils = require('../src/utils');
  
  test('toPascalCase should convert class names correctly', () => {
    expect(utils.toPascalCase('root')).toBe('StyledBox');
    expect(utils.toPascalCase('buttonLabel')).toBe('ButtonLabel');
    expect(utils.toPascalCase('container')).toBe('StyledBox');
  });
  
  test('generateUniqueComponentName should handle duplicates', () => {
    const existingNames = new Set(['StyledBox', 'LabelText']);

    const name1 = utils.generateUniqueComponentName('root', existingNames);
    expect(name1).toBe('StyledBox1');

    const name2 = utils.generateUniqueComponentName('root', existingNames);
    expect(name2).toBe('StyledBox2');
  });
  
  test('inferElementType should infer correct element types', () => {
    expect(utils.inferElementType('button')).toBe('Button');
    expect(utils.inferElementType('submitButton')).toBe('Button');
    expect(utils.inferElementType('link')).toBe('a');
    expect(utils.inferElementType('siteHeader')).toBe('header');
    expect(utils.inferElementType('pageFooter')).toBe('footer');
    expect(utils.inferElementType('unknown')).toBe('Box');
  });
});

describe('Cleanup functionality', () => {
  const { cleanup, analyzeForCleanup } = require('../src');
  
  test('should detect unused JSS imports', () => {
    const input = `
import React from 'react';
import { makeStyles, withStyles } from '@mui/styles';
import { Button } from '@mui/material';

function SimpleComponent() {
  return <Button>Click me</Button>;
}

export default SimpleComponent;
`;
    
    const analysis = analyzeForCleanup(input, { parser: 'babel' });
    expect(analysis.unusedJSSImports).toContain('makeStyles');
    expect(analysis.unusedJSSImports).toContain('withStyles');
  });
  
  test('should remove unused JSS imports', () => {
    const input = `
import React from 'react';
import { makeStyles, withStyles } from '@mui/styles';
import { Button } from '@mui/material';

function SimpleComponent() {
  return <Button>Click me</Button>;
}

export default SimpleComponent;
`;
    
    const result = cleanup(input, { parser: 'babel' });
    expect(result.report.removedImports).toContain('makeStyles');
    expect(result.report.removedImports).toContain('withStyles');
    expect(result.source).not.toContain('makeStyles');
    expect(result.source).not.toContain('@mui/styles');
    expect(result.source).toContain('Button');
  });
  
  test('should detect dead style files', () => {
    const input = `
const buttonStyles = (theme) => ({
  root: {
    backgroundColor: theme.palette.primary.main,
  },
});

export default buttonStyles;
`;
    
    const analysis = analyzeForCleanup(input, { parser: 'babel' });
    expect(analysis.isDead).toBe(true);
    expect(analysis.deadReason).toContain('style');
  });
  
  test('should not mark files with components as dead', () => {
    const input = `
import React from 'react';

function Component() {
  return <div>Hello</div>;
}

export default Component;
`;
    
    const analysis = analyzeForCleanup(input, { parser: 'babel' });
    expect(analysis.isDead).toBe(false);
  });
});

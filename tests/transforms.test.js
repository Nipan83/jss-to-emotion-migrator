/**
 * Tests for the JSS → Emotion migrator.
 *
 * The tool emits individual `styled(<MuiComponent | 'htmlTag'>)` components,
 * matching the conventions reverse-engineered from the imaging-fe migration:
 *   - MUI `classes={{ slot }}` prop → slot selectors (root/state/child)
 *   - conditional classnames → boolean prop + shouldForwardProp
 *   - makeStyles / withStyles / compose / classes-prop cleanup
 */

const fs = require('fs');
const path = require('path');
const { migrate } = require('../src');
const utils = require('../src/utils');

const fixturesDir = path.join(__dirname, 'fixtures');

const normalize = (code) => code.replace(/\r\n/g, '\n').trim();

function runFixture(name) {
  const input = fs.readFileSync(path.join(fixturesDir, `${name}.input.js`), 'utf-8');
  const expected = fs.readFileSync(path.join(fixturesDir, `${name}.output.js`), 'utf-8');
  const result = migrate(input, { parser: 'babel', transform: 'jssToEmotion', filePath: `${name}.js` });
  return { result, expected };
}

describe('golden fixtures', () => {
  const fixtures = [
    'makeStyles-basic',
    'makeStyles-external',
    'makeStyles-noTheme',
    'withStyles',
    'classes-slot-prop',
    'conditional-prop',
    'inline-withStyles',
    'dead-class',
  ];

  fixtures.forEach(name => {
    test(`${name} matches golden output`, () => {
      const { result, expected } = runFixture(name);
      expect(normalize(result)).toBe(normalize(expected));
    });
  });
});

describe('makeStyles → styled', () => {
  test('infers element from JSX and adds styled import', () => {
    const { result } = runFixture('makeStyles-basic');
    expect(result).toContain("import { styled } from '@mui/material/styles'");
    expect(result).toContain("const Root = styled('div')(({ theme }) => ({");
    expect(result).toContain("const Label = styled('span')(({ theme }) => ({");
    expect(result).not.toMatch(/makeStyles|useStyles|classes\./);
    expect(result).toContain('<Root>');
    expect(result).toContain('<Label>');
  });

  test('static styles use the object form (no theme param)', () => {
    const { result } = runFixture('makeStyles-noTheme');
    expect(result).toContain("const Box = styled('div')({");
    expect(result).not.toContain('=> ({');
  });

  test('drops external style object once migrated', () => {
    const { result } = runFixture('makeStyles-external');
    expect(result).not.toContain('const styles =');
    expect(result).toContain("const Container = styled('div')");
    expect(result).toContain("const Title = styled('h2')");
  });
});

describe('MUI classes={{ slot }} prop', () => {
  test('maps root → top-level, child slot → "& .MuiX-slot", state → "&.Mui-state"', () => {
    const { result } = runFixture('classes-slot-prop');
    expect(result).toContain('const StyledTabs = styled(Tabs)({');
    expect(result).toContain("minHeight: 'unset'");
    expect(result).toContain("'& .MuiTabs-indicator'");
    expect(result).toContain("'& .MuiTabs-scroller'");
    expect(result).toContain('const StyledTab = styled(Tab)({');
    expect(result).toContain("'&.Mui-selected'");
    expect(result).toContain('<StyledTabs>');
    expect(result).toContain('<StyledTab />');
    expect(result).not.toContain('classes=');
  });
});

describe('conditional (prop-based) styling', () => {
  test('classnames conditional → shouldForwardProp + boolean prop + spread', () => {
    const { result } = runFixture('conditional-prop');
    expect(result).toContain("shouldForwardProp: prop => prop !== 'selected'");
    expect(result).toContain('(({ selected }) => ({');
    expect(result).toContain('...(selected && {');
    expect(result).toContain('selected={selected}');
    // hover / MUI slot selectors preserved verbatim
    expect(result).toContain("'&:hover'");
    expect(result).toContain("'& .MuiChip-icon'");
    // unused classnames import removed
    expect(result).not.toContain('classnames');
  });
});

describe('withStyles / compose / HOC cleanup', () => {
  test('compose(withStyles(s), connect(...)) → connect(...), classes PropType removed', () => {
    const { result } = runFixture('conditional-prop');
    expect(result).toContain('export default connect(null, null)(Legend)');
    expect(result).not.toContain('compose');
    expect(result).not.toContain('withStyles');
    expect(result).not.toContain('classes: PropTypes');
    expect(result).toContain('function Legend({ selected })');
  });

  test('inline withStyles({...})(MuiComp) → styled(MuiComp)({...})', () => {
    const { result } = runFixture('inline-withStyles');
    expect(result).toContain('const StyledIconButton = styled(IconButton)({');
    expect(result).toContain('paddingRight: 10');
    expect(result).not.toContain('withStyles');
  });
});

describe('aliased MUI component', () => {
  test('uses the canonical component name for selectors and naming', () => {
    const input = `
import React from 'react';
import { Dialog as MuiDialog } from '@mui/material';
import { makeStyles } from '@mui/styles';
const useStyles = makeStyles({ paper: { maxWidth: 'unset' } });
function D({ children }) {
  const classes = useStyles();
  return <MuiDialog classes={{ paper: classes.paper }}>{children}</MuiDialog>;
}
export default D;
`;
    const result = migrate(input, { parser: 'babel', transform: 'jssToEmotion' });
    expect(result).toContain('const StyledDialog = styled(MuiDialog)({');
    expect(result).toContain("'& .MuiDialog-paper'");
    expect(result).not.toContain('MuiMuiDialog');
  });
});

describe('dead / unresolved classes', () => {
  test('strips references to classes never defined in a resolved source', () => {
    const { result } = runFixture('dead-class');
    expect(result).toContain('const Title = styled('); // resolved
    expect(result).toContain('<div>{children}</div>'); // dead classes.root stripped
    expect(result).not.toContain('classes.root');
    expect(result).not.toContain('classes.title');
  });
});

describe('edge cases', () => {
  test('files without JSS imports are unchanged', () => {
    const input = "import React from 'react';\nfunction C() { return <div>Hi</div>; }\nexport default C;\n";
    expect(migrate(input, { parser: 'babel', transform: 'jssToEmotion' })).toBe(input);
  });

  test('leaves files with dynamic per-class function styles untouched', () => {
    // `root: props => ({...})` needs manual shouldForwardProp work → not migrated.
    const input = `
import React from 'react';
import { Button } from '@mui/material';
import { withStyles } from '@mui/styles';
const CustomButton = withStyles({
  root: props => ({ backgroundColor: props.color }),
})(Button);
function T() { return <CustomButton color='red'>x</CustomButton>; }
export default T;
`;
    expect(migrate(input, { parser: 'babel', transform: 'jssToEmotion' })).toBe(input);
  });

  test('leaves cross-file classes and their classes prop intact', () => {
    // `classes` comes from a parent (no in-file makeStyles/withStyles source),
    // so nothing is touched.
    const input = `
import React from 'react';
function Child({ classes }) {
  return <div className={classes.loader}>x</div>;
}
export default Child;
`;
    // No JSS imports at all → unchanged.
    expect(migrate(input, { parser: 'babel', transform: 'jssToEmotion' })).toBe(input);
  });
});

describe('utility functions', () => {
  test('deriveStyledComponentName: MUI component → Styled<Component>', () => {
    expect(utils.deriveStyledComponentName({
      base: 'Tabs', isComponent: true, primaryClassKey: 'tabsRoot', existingNames: new Set(),
    })).toBe('StyledTabs');
  });

  test('deriveStyledComponentName: HTML element → PascalCase(classKey)', () => {
    expect(utils.deriveStyledComponentName({
      base: 'div', isComponent: false, primaryClassKey: 'header', existingNames: new Set(),
    })).toBe('Header');
  });

  test('deriveStyledComponentName: dedupes collisions', () => {
    const existing = new Set(['StyledChip']);
    const name = utils.deriveStyledComponentName({
      base: 'Chip', isComponent: true, primaryClassKey: 'chip', existingNames: existing,
    });
    expect(name).not.toBe('StyledChip');
    expect(existing.has(name)).toBe(true);
  });

  test('slotToSelector maps slots per MUI conventions', () => {
    expect(utils.slotToSelector('root', 'Tabs')).toBeNull();
    expect(utils.slotToSelector('indicator', 'Tabs')).toBe('& .MuiTabs-indicator');
    expect(utils.slotToSelector('selected', 'Tab')).toBe('&.Mui-selected');
    expect(utils.slotToSelector('checked', 'Checkbox')).toBe('&.Mui-checked');
    expect(utils.slotToSelector('paper', 'Dialog')).toBe('& .MuiDialog-paper');
  });
});

describe('cleanup functionality', () => {
  const { cleanup, analyzeForCleanup } = require('../src');

  test('detects unused JSS imports', () => {
    const input = `
import React from 'react';
import { makeStyles, withStyles } from '@mui/styles';
import { Button } from '@mui/material';
function C() { return <Button>Click</Button>; }
export default C;
`;
    const analysis = analyzeForCleanup(input, { parser: 'babel' });
    expect(analysis.unusedJSSImports).toContain('makeStyles');
    expect(analysis.unusedJSSImports).toContain('withStyles');
  });

  test('removes unused JSS imports', () => {
    const input = `
import React from 'react';
import { makeStyles } from '@mui/styles';
import { Button } from '@mui/material';
function C() { return <Button>Click</Button>; }
export default C;
`;
    const result = cleanup(input, { parser: 'babel' });
    expect(result.report.removedImports).toContain('makeStyles');
    expect(result.source).not.toContain('@mui/styles');
    expect(result.source).toContain('Button');
  });

  test('detects dead style-only files', () => {
    const input = `
const buttonStyles = (theme) => ({ root: { color: theme.palette.primary.main } });
export default buttonStyles;
`;
    const analysis = analyzeForCleanup(input, { parser: 'babel' });
    expect(analysis.isDead).toBe(true);
  });
});

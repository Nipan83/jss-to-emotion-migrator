import React from 'react';
import { IconButton } from '@mui/material';
import { withStyles } from '@mui/styles';

const StyledIconButton = withStyles({
  root: {
    paddingRight: 10,
    paddingLeft: 6,
  },
})(IconButton);

function Toolbar() {
  return <StyledIconButton aria-label='info' />;
}

export default Toolbar;

import React from 'react';
import { IconButton } from '@mui/material';
import { styled } from '@mui/material/styles';

const StyledIconButton = styled(IconButton)({
  paddingRight: 10,
  paddingLeft: 6,
});

function Toolbar() {
  return <StyledIconButton aria-label='info' />;
}

export default Toolbar;
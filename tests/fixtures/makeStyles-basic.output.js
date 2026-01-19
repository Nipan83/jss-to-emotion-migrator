import React from 'react';
import { styled } from '@mui/material/styles';

const Root = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  borderRadius: 20,
  background: theme.palette.grey[50],
}));

const Label = styled('span')(({ theme }) => ({
  color: theme.palette.primary.main,
}));

function Status({ label }) {
  return (
    <Root>
      <Label>{label}</Label>
    </Root>
  );
}

export default Status;

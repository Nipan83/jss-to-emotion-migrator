import React from 'react';
import { styled } from '@mui/material/styles';

const Title = styled('span')({
  fontSize: 16,
});

function Dialog({ children }) {
  return (
    <div>
      <Title>Title</Title>
      <div>{children}</div>
    </div>
  );
}

export default Dialog;
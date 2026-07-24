import React from 'react';
import { styled } from '@mui/material/styles';

const Box = styled('div')({
  display: 'flex',
  padding: 16,
  backgroundColor: '#f5f5f5',
});

const Text = styled('p')({
  fontSize: 14,
  lineHeight: 1.5,
});

function SimpleBox({ children }) {
  return (
    <Box>
      <Text>{children}</Text>
    </Box>
  );
}

export default SimpleBox;
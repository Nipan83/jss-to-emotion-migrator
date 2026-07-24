import React from 'react';
import { styled } from '@mui/material/styles';

const Root = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  padding: theme.spacing(3),
}));

const Header = styled('div')(({ theme }) => ({
  marginBottom: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const Content = styled('div')({
  flex: 1,
  overflow: 'auto',
});

function Panel({ title, children }) {
  return (
    <Root>
      <Header>
        <h3>{title}</h3>
      </Header>
      <Content>
        {children}
      </Content>
    </Root>
  );
}

export default Panel;
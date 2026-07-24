import React from 'react';
import { Tabs, Tab } from '@mui/material';
import { styled } from '@mui/material/styles';

const StyledTabs = styled(Tabs)({
  minHeight: 'unset',
  '& .MuiTabs-indicator': {
    display: 'none',
  },
  '& .MuiTabs-scroller': {
    zIndex: 1,
    height: 42,
  },
});

const StyledTab = styled(Tab)({
  padding: '8px',
  '&.Mui-selected': {
    background: '#FFF',
  },
});

function TabsComponent(props) {
  return (
    <StyledTabs>
      <StyledTab />
    </StyledTabs>
  );
}

export default TabsComponent;
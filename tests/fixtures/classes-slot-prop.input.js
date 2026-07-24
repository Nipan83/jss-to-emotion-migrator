import React from 'react';
import { Tabs, Tab } from '@mui/material';
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles({
  tabsRoot: { minHeight: 'unset' },
  tabsIndicator: { display: 'none' },
  tabsScroller: { zIndex: 1, height: 42 },
  tabRoot: { padding: '8px' },
  selectedTab: { background: '#FFF' },
});

function TabsComponent(props) {
  const classes = useStyles();
  return (
    <Tabs classes={{ root: classes.tabsRoot, indicator: classes.tabsIndicator, scroller: classes.tabsScroller }}>
      <Tab classes={{ root: classes.tabRoot, selected: classes.selectedTab }} />
    </Tabs>
  );
}

export default TabsComponent;

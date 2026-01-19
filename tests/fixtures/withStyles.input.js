import React from 'react';
import { withStyles } from '@mui/styles';

const styles = (theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    padding: theme.spacing(3),
  },
  header: {
    marginBottom: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
});

function Panel({ classes, title, children }) {
  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <h3>{title}</h3>
      </div>
      <div className={classes.content}>
        {children}
      </div>
    </div>
  );
}

export default withStyles(styles)(Panel);

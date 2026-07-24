import React from 'react';
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles({
  title: { fontSize: 16 },
});

function Dialog({ children }) {
  const classes = useStyles();
  return (
    <div>
      <span className={classes.title}>Title</span>
      <div className={classes.root}>{children}</div>
    </div>
  );
}

export default Dialog;

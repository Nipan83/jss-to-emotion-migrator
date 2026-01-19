import React from 'react';
import makeStyles from '@mui/styles/makeStyles';

const useStyles = makeStyles((theme) => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    borderRadius: 20,
    background: theme.palette.grey[50],
  },
  label: {
    color: theme.palette.primary.main,
  }
}));

function Status({ label }) {
  const classes = useStyles();
  return (
    <div className={classes.root}>
      <span className={classes.label}>{label}</span>
    </div>
  );
}

export default Status;

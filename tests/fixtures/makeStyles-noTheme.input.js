import React from 'react';
import makeStyles from '@mui/styles/makeStyles';

const useStyles = makeStyles({
  box: {
    display: 'flex',
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  text: {
    fontSize: 14,
    lineHeight: 1.5,
  },
});

function SimpleBox({ children }) {
  const classes = useStyles();
  
  return (
    <div className={classes.box}>
      <p className={classes.text}>{children}</p>
    </div>
  );
}

export default SimpleBox;

import React from 'react';
import { makeStyles } from '@mui/styles';

// External styles definition - this is what MUI's codemod struggles with
const styles = (theme) => ({
  container: {
    padding: theme.spacing(2),
    margin: theme.spacing(1),
    backgroundColor: theme.palette.background.paper,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.palette.text.primary,
  },
  button: {
    marginTop: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
  },
});

const useStyles = makeStyles(styles);

function Card({ title, onAction }) {
  const classes = useStyles();
  
  return (
    <div className={classes.container}>
      <h2 className={classes.title}>{title}</h2>
      <button className={classes.button} onClick={onAction}>
        Click Me
      </button>
    </div>
  );
}

export default Card;

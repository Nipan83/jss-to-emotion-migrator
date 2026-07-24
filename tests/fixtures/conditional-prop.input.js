import React from 'react';
import { Chip } from '@mui/material';
import { withStyles } from '@mui/styles';
import { compose } from '@reduxjs/toolkit';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import classnames from 'classnames';

const styles = {
  chip: {
    border: '1px solid rgb(211, 211, 211)',
    '&:hover': { color: 'rgb(0, 0, 0)' },
    '& .MuiChip-icon': { fontSize: '15px' },
  },
  selectedChip: { borderColor: 'rgb(33, 150, 243)' },
};

function Legend({ classes, selected }) {
  return (
    <Chip
      className={classnames(classes.chip, { [classes.selectedChip]: selected })}
      label='tag'
    />
  );
}

Legend.propTypes = {
  classes: PropTypes.object,
  selected: PropTypes.bool,
};

export default compose(withStyles(styles), connect(null, null))(Legend);

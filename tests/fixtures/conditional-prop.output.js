import React from 'react';
import { Chip } from '@mui/material';
import { styled } from '@mui/material/styles';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

const StyledChip = styled(Chip, {
  shouldForwardProp: prop => prop !== 'selected',
})(({ selected }) => ({
  border: '1px solid rgb(211, 211, 211)',
  '&:hover': {
    color: 'rgb(0, 0, 0)',
  },
  '& .MuiChip-icon': {
    fontSize: '15px',
  },
  ...(selected && {
    borderColor: 'rgb(33, 150, 243)',
  }),
}));

function Legend({ selected }) {
  return (
    <StyledChip
      label='tag'
      selected={selected}
    />
  );
}

Legend.propTypes = {
  selected: PropTypes.bool,
};

export default connect(null, null)(Legend);
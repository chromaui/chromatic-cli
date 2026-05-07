import PropTypes from 'prop-types';
import React from 'react';

const style = {
  alignItems: 'center',
  backgroundColor: 'darkkhaki',
  display: 'flex',
  height: '50px',
  justifyContent: 'center',
  width: '50px',
};

export default function A({ backgroundColor, ...props }) {
  let computedStyle = style;
  if (backgroundColor) computedStyle = { ...style, backgroundColor };

  return <div {...props} style={computedStyle} />;
}

A.propTypes = { thing: PropTypes.func.isRequired };

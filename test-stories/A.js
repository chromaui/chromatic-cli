import PropTypes from 'prop-types';
import React from 'react';

const style = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '50px',
  height: '50px',
  backgroundColor: 'darkkhaki',
};

/**
 * A div used for test stories.
 *
 * @param param0 Additional properties for a <div> element.
 * @param param0.backgroundColor The desired background color for the div.
 *
 * @returns A stsyled div element.
 */
export default function A({ backgroundColor, ...props }) {
  let computedStyle = style;
  if (backgroundColor) {
    computedStyle = { ...style, backgroundColor };
  }

  return <div {...props} style={computedStyle} />;
}

A.propTypes = { thing: PropTypes.func.isRequired };

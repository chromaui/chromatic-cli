import React from 'react';

const style = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  backgroundColor: 'blueviolet',
};

/**
 * A span used for test stories.
 *
 * @param props Additional properties for a <span> element.
 *
 * @returns A styled span element.
 */
export default function B(props) {
  return <span {...props} style={style} />;
}

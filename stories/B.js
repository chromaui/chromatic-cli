/* eslint-disable react/jsx-props-no-spreading */
import React from 'react';

const style = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  backgroundColor: 'blueviolet',
};

export default function B(props) {
  return <span {...props} style={style} />;
}

import React from 'react';

import A from './A';

const HOC = (Component) => {
  const Wrapped = (props) => {
    return <Component {...props} />;
  };

  Wrapped.displayName = `wrapped(${Component.displayName || Component.name})`;

  return Wrapped;
};

export default HOC(HOC(HOC(A)));

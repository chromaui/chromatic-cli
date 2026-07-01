import React from 'react';

import AWrapped from './aWrap';
import B from './b';
import Star from './star';

export default {
  title: 'Components',
  parameters: { layout: 'padded' },
};

export const Span = () => <B />;

export const StarSvg = () => <Star />;

export const WrappedA = () => <AWrapped thing={() => {}}>Wrapped</AWrapped>;

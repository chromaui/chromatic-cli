/* eslint-env browser */

import isChromatic from '../isChromatic';

export default {
  title: 'Tests',
  parameters: { chromatic: { viewports: [600, 1200] }, layout: 'padded' },
};

export const WithViewports = {
  render: () => {
    if (window.matchMedia('(max-width: 400px)').matches) {
      return 'A';
    } else if (window.matchMedia('(max-width: 800px)').matches) {
      return 'B';
    }
    return 'C';
  },

  parameters: { chromatic: { viewports: [320, 600, 1200] } },
};

export const WithDelay = {
  render: () => (isChromatic() ? 'Chromatic' : 'Second'),
  parameters: { chromatic: { delay: 1000 } },
};

export const DisabledStory = {
  render: () => 'Disabled story',
  parameters: { chromatic: { disable: true } },
};

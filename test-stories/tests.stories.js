/* eslint-env browser */

import React from 'react';

import isChromatic from '../isChromatic';
import AComponent from './a';

export default {
  title: 'Tests',
  parameters: { chromatic: { viewports: [600, 1200] }, layout: 'padded' },
};

export const WithViewports = {
  render: () => {
    let bg;
    if (window.matchMedia('(max-width: 400px)').matches) {
      bg = 'cyan';
    } else if (window.matchMedia('(max-width: 800px)').matches) {
      bg = 'orange';
    }
    return (
      <AComponent backgroundColor={bg} thing={() => {}}>
        Contents
      </AComponent>
    );
  },

  parameters: { chromatic: { viewports: [320, 600, 1200] } },
};

export const WithDelay = {
  render: () => <AComponent thing={() => {}}>{isChromatic() ? 'Chromatic' : 'Second'}</AComponent>,

  parameters: { chromatic: { delay: 1000 } },
};

export const DisabledStory = {
  render: () => <AComponent thing={() => {}}>Disabled story</AComponent>,
  parameters: { chromatic: { disable: true } },
};

export const IgnoredElements = () => (
  <div>
    <img
      alt=""
      src="http://fpoimg.com/100x100?text=foozbar"
      data-chromatic="ignore"
      style={{ border: '2px solid orangered' }}
    />
    <img
      alt=""
      src="http://fpoimg.com/100x100?text=foozbar"
      className="chromatic-ignore"
      style={{ border: '2px solid orangered' }}
    />
    <img
      alt=""
      src="http://fpoimg.com/100x100?text=foozbar"
      style={{ border: '2px solid green' }}
    />
  </div>
);

export const RightToLeftBody = () => {
  React.useEffect(() => {
    const { dir } = document.body;
    document.body.dir = 'rtl';
    return () => {
      document.body.dir = dir;
    };
  }, []);
  return <div>Content</div>;
};

export const RightToLeftContainer = () => {
  return <div dir="rtl">Content</div>;
};

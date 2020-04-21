/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-env browser */

import React from 'react';
import { storiesOf } from '@storybook/react';
import isChromatic from '../src/isChromatic';

import AComponent from './A';

storiesOf('basics/A', module)
  .addParameters({ chromatic: { viewports: [600, 1200] } })
  .add(
    'simple',
    () => {
      let bg = null;
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
    {
      chromatic: { viewports: [320, 600, 1200] },
    }
  )
  .add(
    'second',
    () => <AComponent thing={() => {}}>{isChromatic() ? 'Chromatic' : 'Second'}</AComponent>,
    {
      chromatic: { delay: 1000 },
    }
  )
  .add('disabled', () => <AComponent thing={() => {}}>Disabled</AComponent>, {
    chromatic: { disable: true },
  })
  .add('with ignored', () => {
    return (
      <div>
        <img
          alt=""
          src="http://fpoimg.com/100x100?text=foobar"
          data-chromatic="ignore"
          style={{ border: '2px solid orangered' }}
        />
        <img
          alt=""
          src="http://fpoimg.com/100x100?text=foobar"
          className="chromatic-ignore"
          style={{ border: '2px solid orangered' }}
        />
        <img
          alt=""
          src="http://fpoimg.com/100x100?text=foobar"
          style={{ border: '2px solid green' }}
        />
      </div>
    );
  });

/* eslint-env browser */

import { storiesOf } from '@storybook/react-webpack5';
import React, { useState } from 'react';

// Some stories to test out timing code. Disabled by default
// These stories are available at (e.g.)
//   http://vmdbnybkvx.staging-tunnel.chromaticqa.com/iframe.html?id=timing--5s

// A component that guarantees the load event won't load for timeout seconds
// Note that the img loading tends to take a litle longer so this is a minimum
const WaitFor = ({ seconds }) => {
  const [count, setCount] = useState(seconds - 1);

  if (count > 0) {
    setTimeout(() => setCount(count - 1), 1000);
  }

  return (
    <div>
      {Array.from({ length: seconds - count }).map((_, index) => (
        <img
          key={index}
          src={`http://deelay.me/1000/http://fpoimg.com/100x100?text=${index}`}
          alt=""
        />
      ))}
    </div>
  );
};

// eslint-disable-next-line unicorn/prefer-module
storiesOf('Timing', module)
  .add('5s', () => <WaitFor seconds={5} />)
  .add('40s', () => <WaitFor seconds={40} />)
  .add('2m', () => <WaitFor seconds={60 * 2} />);

// Insert an invisible image into the body to ensure that the load event doesn't fire before
// the story has been rendered.
// For some reason this is not an issue in real Storybooks
const img = document.createElement('img');
document.body.append(img);
img.outerHTML = `<img style="visibility: hidden; position: absolute;" src="http://deelay.me/1000/http://fpoimg.com/100x100?text=foobar" />`;

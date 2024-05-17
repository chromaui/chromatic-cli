import React, { useState } from 'react';

// Some stories to test out timing code. Disabled by default
// These stories are available at (e.g.)
//   http://vmdbnybkvx.staging-tunnel.chromaticqa.com/iframe.html?id=timing--5s

// A component that guarantees the load event won't load for timeout seconds
// Note that the img loading tends to take a little longer so this is a minimum
const WaitFor = ({ seconds }: { seconds: number }) => {
  const [count, setCount] = useState(seconds - 1);

  if (count > 0) {
    setTimeout(() => setCount(count - 1), 1000);
  }

  return (
    <div>
      {Array.from(new Array(seconds - count)).map((x, index) => (
        <img
          key={index}
          src={`http://deelay.me/1000/http://fpoimg.com/100x100?text=${index}`}
          alt=""
        />
      ))}
    </div>
  );
};

export default {
  title: 'Timing',
};

export const _5S = {
  render: () => <WaitFor seconds={5} />,
  name: '5s',
};

export const _40S = {
  render: () => <WaitFor seconds={40} />,
  name: '40s',
};

export const _2M = {
  render: () => <WaitFor seconds={60 * 2} />,
  name: '2m',
};

// Insert an invisible image into the body to ensure that the load event doesn't fire before
// the story has been rendered.
// For some reason this is not an issue in real Storybooks
const img = document.createElement('img');
document.body.appendChild(img);
img.outerHTML = `<img style="visibility: hidden; position: absolute;" src="http://deelay.me/1000/http://fpoimg.com/100x100?text=foobar" />`;

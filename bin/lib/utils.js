export const lcfirst = str => `${str.charAt(0).toLowerCase()}${str.substr(1)}`;

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export const tick = async (times, interval, fn) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await delay(interval);
    fn(i);
  }
};

export const repeat = (n, char) => [...new Array(Math.round(n))].map(() => char);
export const progress = (percentage, size = 20) => {
  const track = repeat(size, ' ');
  const completed = repeat((percentage / 100) * size || 0, '=');
  return `${completed.join('')}${track.join('')}`.substr(0, 20);
};

export const baseStorybookUrl = url => url.replace(/\/iframe\.html$/, '');

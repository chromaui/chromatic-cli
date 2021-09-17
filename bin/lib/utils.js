import path from 'path';

export const lcfirst = (str) => `${str.charAt(0).toLowerCase()}${str.substr(1)}`;

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

export const baseStorybookUrl = (url) => url.replace(/\/iframe\.html$/, '');

export const rewriteErrorMessage = (err, message) => {
  try {
    // DOMException doesn't allow setting the message, so this might fail
    // eslint-disable-next-line no-param-reassign
    err.message = message;
    return err;
  } catch (ex) {
    const error = new Error(message);
    error.stack = err.stack; // try to preserve the original stack
    return error;
  }
};

export const getWorkingDir = (basePath) => path.posix.relative(basePath, '.');

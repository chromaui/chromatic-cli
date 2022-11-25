import picomatch, { Matcher } from 'picomatch';

export const lcfirst = (str: string) => `${str.charAt(0).toLowerCase()}${str.slice(1)}`;

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const tick = async (times: number, interval: number, fn: (i: number) => any) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await delay(interval);
    fn(i);
  }
};

export const repeat = (n: number, char: string) => [...new Array(Math.round(n))].map(() => char);
export const progress = (percentage: number, size = 20) => {
  const track = repeat(size, ' ');
  const completed = repeat((percentage / 100) * size || 0, '=');
  return `${completed.join('')}${track.join('')}`.substr(0, 20);
};

export const baseStorybookUrl = (url: string) => url.replace(/\/iframe\.html$/, '');

export const rewriteErrorMessage = (err: Error, message: string) => {
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

const fileMatchers: Record<string, Matcher> = {};
export const matchesFile = (glob: string, filepath: string) => {
  if (!fileMatchers[glob]) fileMatchers[glob] = picomatch(glob, { dot: true });
  return fileMatchers[glob](filepath.replace(/^\.\//, ''));
};

export const isPackageManifestFile = (filePath: string) =>
  [/^package\.json$/, /\/package\.json$/].some((re) => re.test(filePath));

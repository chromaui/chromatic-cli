import picomatch, { Matcher } from 'picomatch';

export const lcfirst = (str: string) => `${str.charAt(0).toLowerCase()}${str.slice(1)}`;

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const tick = async (times: number, interval: number, callback: (index: number) => any) => {
  for (let index = 0; index < times; index += 1) {
    await delay(interval);
    callback(index);
  }
};

export const throttle = (fn: (...args: any[]) => void, wait: number) => {
  let previous = 0;
  return (...args: any[]) => {
    const now = Date.now();
    if (now - previous >= wait) {
      previous = now;
      fn(...args);
    }
  };
};

export const repeat = (n: number, char: string) =>
  Array.from({ length: Math.round(n) }).map(() => char);
export const progressBar = (percentage: number, size = 20) => {
  const track = repeat(size, ' ');
  const completed = repeat((percentage / 100) * size || 0, '=');
  return `[${`${completed.join('')}${track.join('')}`.slice(0, 20)}]`;
};
export const activityBar = (n = 0, size = 20) => {
  const track = repeat(size, ' ');
  const index = n % ((size - 1) * 2);
  track[index >= size ? (size - 1) * 2 - index : index] = '*';
  return `[${track.join('')}]`;
};

export const rewriteErrorMessage = (err: Error, message: string) => {
  try {
    // DOMException doesn't allow setting the message, so this might fail
    err.message = message;
    return err;
  } catch {
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
  [/(^|\/)package\.json$/].some((re) => re.test(filePath));

export const isPackageLockFile = (filePath: string) =>
  [/(^|\/)package-lock\.json$/, /(^|\/)yarn\.lock$/].some((re) => re.test(filePath));

export const isPackageMetadataFile = (filePath: string) =>
  isPackageManifestFile(filePath) || isPackageLockFile(filePath);

export const redact = <T>(value: T, ...fields: string[]): T => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, ...fields)) as T;
  const object = { ...value };
  for (const key in object)
    object[key] = fields.includes(key) ? undefined : redact(object[key], ...fields);
  return object;
};

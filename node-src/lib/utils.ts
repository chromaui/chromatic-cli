import picomatch, { Matcher } from 'picomatch';

export const lcfirst = (str: string) => `${str.charAt(0).toLowerCase()}${str.slice(1)}`;

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const tick = async (times: number, interval: number, fn: (i: number) => any) => {
  for (let i = 0; i < times; i += 1) {
    await delay(interval);
    fn(i);
  }
};

export const throttle = (fn: (...args: any[]) => void, wait: number) => {
  let prev = 0;
  return (...args: any[]) => {
    const now = Date.now();
    if (now - prev >= wait) {
      prev = now;
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
  const i = n % ((size - 1) * 2);
  track[i >= size ? (size - 1) * 2 - i : i] = '*';
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
  const obj = { ...value };
  for (const key in obj) obj[key] = fields.includes(key) ? undefined : redact(obj[key], ...fields);
  return obj;
};

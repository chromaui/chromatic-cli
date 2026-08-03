import chalk from 'chalk';
import picomatch, { Matcher } from 'picomatch';

import { Context } from '../types';

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

export const groupUntracedFilesByGlob = (untracedFiles: NonNullable<Context['untracedFiles']>) => {
  const filesByGlob = new Map<string, string[]>();
  for (const { filepath, glob } of untracedFiles) {
    const files = filesByGlob.get(glob) ?? [];
    files.push(filepath);
    filesByGlob.set(glob, files);
  }
  return [...filesByGlob.entries()]
    .map(
      ([glob, files]) =>
        chalk`Files matching {bold ${glob}}:\n{dim →} ${files.join(chalk`\n{dim →} `)}`
    )
    .join('\n');
};

export const isPackageManifestFile = (filePath: string) =>
  [/(^|\/)package\.json$/].some((re) => re.test(filePath));

export const isPackageLockFile = (filePath: string) =>
  [/(^|\/)package-lock\.json$/, /(^|\/)yarn\.lock$/].some((re) => re.test(filePath));

export const isPackageMetadataFile = (filePath: string) =>
  isPackageManifestFile(filePath) || isPackageLockFile(filePath);

/**
 * Redacts the named fields, at any depth, from an object bound for JSON.
 *
 * Values that JSON cannot represent usefully are converted on the way: a Set becomes an array, a
 * Date its ISO string, and an Error its name, message and stack.
 *
 * @param value The object to redact.
 * @param fields The field names to redact.
 *
 * @returns The redacted object, still indexable by the caller.
 */
export function redact<T extends object>(value: T, ...fields: string[]): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [
      key,
      fields.includes(key) ? undefined : redactValue(field, fields),
    ])
  );
}

function redactValue(value: unknown, fields: string[]): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, fields));
  if (value instanceof Set) return [...value].map((item) => redactValue(item, fields));
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return redact({ name: value.name, message: value.message, stack: value.stack }, ...fields);
  }
  return redact(value, ...fields);
}

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

/**
 * Whether a file is a documentation file.
 *
 * @param filePath The path to the file.
 *
 * @returns True if the file is a documentation file.
 */
export function isDocumentationFile(filePath: string) {
  return ['.md', '.txt'].some((extension) => filePath.toLowerCase().endsWith(extension));
}

export const isPackageManifestFile = (filePath: string) =>
  [/(^|\/)package\.json$/].some((re) => re.test(filePath));

export const PNPM_LOCK_FILE = 'pnpm-lock.yaml';
export const SUPPORTED_LOCK_FILES = ['yarn.lock', PNPM_LOCK_FILE, 'package-lock.json'];

export const isPackageLockFile = (filePath: string) =>
  SUPPORTED_LOCK_FILES.some(
    (lockfile) => filePath === lockfile || filePath.endsWith(`/${lockfile}`)
  );

export const isPackageMetadataFile = (filePath: string) =>
  isPackageManifestFile(filePath) || isPackageLockFile(filePath);

const REDACTED = '<redacted>';
const SENSITIVE_KEY_PATTERN = /(token|authorization)/i;
// Anchored on the header name (or the start of a raw header value) so harmless mentions of
// "bearer" stay untouched; the scheme stays readable while the credential after it is replaced.
const AUTHORIZATION_CREDENTIAL_PATTERN =
  /((?:authorization\s*:\s*|^\s*)(?:basic|bearer)\s+)[^\s"',;]+/gi;

/**
 * Replace the credential of an embedded or bare Authorization/Bearer/Basic value, then scrub
 * every collected secret from the string.
 *
 * @param value The string to scrub.
 * @param secrets The collected secret values to replace.
 *
 * @returns The scrubbed string.
 */
const scrubString = (value: string, secrets: string[]): string => {
  let result: string = value.replaceAll(AUTHORIZATION_CREDENTIAL_PATTERN, `$1${REDACTED}`);
  for (const secret of secrets) {
    result = result.replaceAll(secret, REDACTED);
  }
  return result;
};

/**
 * Collect the strings this walk treats as secret: every string inside a subtree under a
 * sensitive key, arrays included (repeated --project-token flags land in flags.projectToken
 * as an array). Strings outside those subtrees are not secrets.
 *
 * @param node The node to walk.
 * @param sensitive Whether an ancestor key already matched the sensitive-name pattern.
 *
 * @returns The collected secret strings.
 */
const collectStrings = (node: unknown, sensitive: boolean): string[] => {
  if (typeof node === 'string') return sensitive ? [node] : [];
  if (Array.isArray(node)) return node.flatMap((item) => collectStrings(item, sensitive));
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, item]) =>
    collectStrings(item, sensitive || SENSITIVE_KEY_PATTERN.test(key))
  );
};

/**
 * Remove values under sensitive keys at any depth — any key matching the sensitive-name
 * pattern (token/authorization, case-insensitive) — and scrub the values collected from
 * those same keys out of every remaining string, so a credential survives in no string
 * form: not under its key, not repeated in plain string collections like
 * options.originalArgv, and not inside embedded Authorization headers. `secretSources`
 * contribute their sensitive values to the collection without being walked into the output
 * (e.g. ctx.env, whose key the caller drops). Secrets are deduplicated and replaced
 * longest-first, so a shorter value that is a prefix of a longer one cannot leave the
 * longer secret's suffix exposed.
 *
 * @param value The value to walk.
 * @param secretSources Extra values to collect secrets from, excluded from the output.
 *
 * @returns The value with sensitive keys removed and secrets scrubbed.
 */
export const redact = <T>(value: T, ...secretSources: unknown[]): T => {
  const secrets = [
    ...new Set([value, ...secretSources].flatMap((node) => collectStrings(node, false))),
  ].sort((a, b) => b.length - a.length);
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return scrubString(node, secrets);
    if (node === null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((item) => walk(item));
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? undefined : walk(item),
      ])
    );
  };
  return walk(value) as T;
};

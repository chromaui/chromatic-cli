import { readFileSync } from 'node:fs';

import { rewriteJson } from './shared';

/**
 * Changes package.json in place, so only the keys that change are touched.
 *
 * @param file The package.json to edit.
 * @param change Edits the parsed JSON in place.
 *
 * @returns The edit for a fix.
 */
export function packageJsonEdit(file: string, change: (json: Record<string, any>) => void) {
  const previous = readFileSync(file, 'utf8');
  const json = JSON.parse(previous);
  change(json);
  return { file, content: rewriteJson(json, previous) };
}

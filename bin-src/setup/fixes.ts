import { readFileSync } from 'node:fs';

import { formatJson } from './shared';

/**
 * Changes package.json and keeps its indentation.
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
  return { file, content: formatJson(json, previous) };
}

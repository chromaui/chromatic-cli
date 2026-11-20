import { readFileSync } from 'node:fs';

import { formatJson } from './shared';

const leading = (line: string) => /^\s*/.exec(line)?.[0] ?? '';

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

/**
 * Makes every actions/checkout step in a workflow clone full history with fetch-depth: 0. Edits
 * the text rather than parsing YAML, so comments and formatting stay as they are.
 *
 * @param text The workflow file.
 *
 * @returns The new text, or undefined when there's no checkout step it can change.
 */
export function githubFetchDepth(text: string) {
  const lines = text.split('\n');
  // Go bottom up, so inserting lines doesn't move the steps still to do.
  for (let index = lines.length - 1; index >= 0; index--) {
    const match = /^(\s*)(- )?uses:\s*["']?actions\/checkout@/.exec(lines[index]);
    if (!match) continue;
    // The step's keys line up with "uses", one level in from its "-".
    const indent = match[1] + (match[2] ? '  ' : '');
    const dash = `${indent.slice(2)}- `;
    let start = index;
    while (!match[2] && start > 0 && !lines[start].startsWith(dash)) start--;
    let end = index + 1;
    while (
      end < lines.length &&
      (!lines[end].trim() || leading(lines[end]).length >= indent.length)
    )
      end++;

    const step = lines.slice(start, end);
    const depthAt = step.findIndex((line) => /^\s*fetch-depth:/.test(line));
    const withAt = step.findIndex((line) => line.startsWith(`${indent}with:`));
    if (depthAt !== -1) {
      lines[start + depthAt] = lines[start + depthAt].replace(/fetch-depth:.*/, 'fetch-depth: 0');
    } else if (withAt !== -1 && /^\s*with:\s*$/.test(step[withAt])) {
      lines.splice(start + withAt + 1, 0, `${indent}  fetch-depth: 0`);
    } else if (withAt === -1) {
      lines.splice(index + 1, 0, `${indent}with:`, `${indent}  fetch-depth: 0`);
    }
  }
  const result = lines.join('\n');
  return result === text ? undefined : result;
}

/**
 * Sets GIT_DEPTH: 0 on each GitLab job that runs Chromatic, so only those jobs clone full history.
 *
 * @param text The .gitlab-ci.yml file.
 *
 * @returns The new text, or undefined when no job runs Chromatic.
 */
export function gitlabGitDepth(text: string) {
  const lines = text.split('\n');
  const tops = lines.flatMap((line, index) =>
    /^[\w.-][^:#]*:\s*(#.*)?$/.test(line) ? [index] : []
  );
  for (let k = tops.length - 1; k >= 0; k--) {
    const start = tops[k] + 1;
    const end = tops[k + 1] ?? lines.length;
    const job = lines.slice(start, end);
    // A job has a script; this skips keys like stages, where "chromatic" may be a stage name.
    const runsChromatic =
      job.some((line) => /^\s*script:/.test(line)) &&
      job.some((line) => /^[^#]*\bchromatic\b/.test(line));
    if (!runsChromatic) continue;
    const indent = leading(job.find((line) => line.trim()) ?? '  ') || '  ';
    const depthAt = job.findIndex((line) => /^\s*GIT_DEPTH:/.test(line));
    const variablesAt = job.findIndex((line) => line.startsWith(`${indent}variables:`));
    if (depthAt !== -1) {
      lines[start + depthAt] = lines[start + depthAt].replace(/GIT_DEPTH:.*/, 'GIT_DEPTH: 0');
    } else if (variablesAt !== -1 && /^\s*variables:\s*$/.test(job[variablesAt])) {
      lines.splice(start + variablesAt + 1, 0, `${indent}${indent}GIT_DEPTH: 0`);
    } else if (variablesAt === -1) {
      lines.splice(start, 0, `${indent}variables:`, `${indent}${indent}GIT_DEPTH: 0`);
    }
  }
  const result = lines.join('\n');
  return result === text ? undefined : result;
}

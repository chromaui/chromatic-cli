import { color } from './shared';

// In JSON, a line that only gains or loses a trailing comma, before a key added after it, isn't a
// change. In other files, such as .env, a comma is part of the value.
const withoutComma = (line: string) => line.replace(/,\s*$/, '');
// A line that is just a key opening an object or array, such as `"scripts": {`, so it holds no value.
const HEADING = /^\s+"[^"]*"\s*:\s*[[{]\s*$/;

// A line that closes an object or array, such as `},`.
const CLOSING = /^\s*[\]}],?\s*$/;

/**
 * The line that opens the object or array a line sits in, such as `"scripts": {`, so a diff can
 * say where a change goes. The file's outermost brace doesn't count, nor does a line that holds
 * values as well as opening one.
 *
 * @param lines The file's lines.
 * @param at The changed line.
 *
 * @returns The opening line's index, if there is one.
 */
function parentLine(lines: string[], at: number) {
  const indent = lines[at].search(/\S/);
  for (let index = at - 1; index >= 0; index--) {
    const depth = lines[index].search(/\S/);
    if (depth !== -1 && depth < indent) return HEADING.test(lines[index]) ? index : undefined;
  }
  return undefined;
}

interface Op {
  kind: 'same' | 'del' | 'add';
  a: number;
  b: number;
}

/**
 * Lines kept, removed and added, by longest common subsequence, so an added line that repeats an
 * existing one, such as a second "with:", still shows.
 *
 * @param a The lines before.
 * @param b The lines after.
 * @param same Whether two lines count as the same.
 *
 * @returns One step per line, with its index in each.
 */
function diffOps(a: string[], b: string[], same: (x: string, y: string) => boolean) {
  const lcs = commonLengths(a, b, same);
  const ops: Op[] = [];
  let index = 0;
  let index_ = 0;
  while (index < a.length || index_ < b.length) {
    if (index < a.length && index_ < b.length && same(a[index], b[index_])) {
      ops.push({ kind: 'same', a: index++, b: index_++ });
    } else if (
      index < a.length &&
      (index_ === b.length || lcs[index + 1][index_] >= lcs[index][index_ + 1])
    ) {
      ops.push({ kind: 'del', a: index++, b: index_ });
    } else {
      ops.push({ kind: 'add', a: index, b: index_++ });
    }
  }
  return ops;
}

/**
 * The longest common subsequence's length from each pair of positions onward.
 *
 * @param a The lines before.
 * @param b The lines after.
 * @param same Whether two lines count as the same.
 *
 * @returns The table, one row per line before and one column per line after.
 */
function commonLengths(a: string[], b: string[], same: (x: string, y: string) => boolean) {
  const lcs = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );
  for (let index = a.length - 1; index >= 0; index--) {
    for (let index_ = b.length - 1; index_ >= 0; index_--) {
      lcs[index][index_] = same(a[index], b[index_])
        ? lcs[index + 1][index_ + 1] + 1
        : Math.max(lcs[index + 1][index_], lcs[index][index_ + 1]);
    }
  }
  return lcs;
}

/**
 * The context above a group of changes to a JSON file: the key that opens its object, a `...` for
 * the lines in between, and the line just before the group if it sits beside it, so the reader
 * sees where the change goes. A line that holds values as well as opening an object never shows.
 *
 * @param a The lines before.
 * @param b The lines after.
 * @param first The group's first change.
 * @param previous The unchanged line just before the group, if there is one.
 *
 * @returns The lines to show, uncolored.
 */
function contextAbove(a: string[], b: string[], first: Op, previous: Op | undefined) {
  const side = first.kind === 'add' ? 'b' : 'a';
  const lines = { a, b }[side];
  const at = first[side];
  const heading = parentLine(lines, at);
  if (!previous) return heading === undefined ? [] : [lines[heading]];
  const before = previous[side];
  const shown = heading === undefined || heading === before ? [] : [lines[heading]];
  if (before > (heading ?? 0) + 1) shown.push(gap(lines[at]));
  const sibling = lines[before].search(/\S/) === lines[at].search(/\S/);
  // Its new form, such as a script that gained a comma before the one added after it.
  if (sibling || before === heading) shown.push(b[previous.b]);
  return shown;
}

/**
 * Runs of changed lines, as start and end indexes into the steps.
 *
 * @param ops The diff's steps.
 *
 * @returns Each run's first step and the step after its last.
 */
function changeGroups(ops: Op[]) {
  const groups: [number, number][] = [];
  for (const [index, op] of ops.entries()) {
    if (op.kind === 'same') continue;
    const last = groups.at(-1);
    if (last?.[1] === index) last[1] = index + 1;
    else groups.push([index, index + 1]);
  }
  return groups;
}

/**
 * A short line diff: lines removed in red, lines added in green. In JSON, each group of changes
 * also shows, dimmed, the key that opens its object, the line before it and the line that closes
 * it, with `...` for the lines it leaves out.
 *
 * @param before The file's text now.
 * @param after The file's text after the fix.
 * @param json Whether the file is JSON, where a line that only gains a comma isn't a change.
 *
 * @returns The changed lines, colored.
 */
export function lineDiff(before: string, after: string, json: boolean) {
  const a = before.split('\n');
  const b = after.split('\n');
  const ops = diffOps(a, b, (x, y) => (json ? withoutComma(x) === withoutComma(y) : x === y));
  const changed = (op: Op) => {
    const line = op.kind === 'del' ? a[op.a] : b[op.b];
    if (!line.trim()) return [];
    return [op.kind === 'del' ? color.error(`- ${line}`) : color.success(`+ ${line}`)];
  };
  const below = (next: Op | undefined) =>
    next ? [CLOSING.test(b[next.b]) ? b[next.b] : gap(b[next.b])] : [];
  return changeGroups(ops)
    .flatMap(([start, end]) => [
      ...(json ? contextAbove(a, b, ops[start], ops[start - 1]) : []).map((line) => muted(line)),
      ...ops.slice(start, end).flatMap((op) => changed(op)),
      ...(json ? below(ops[end]) : []).map((line) => muted(line)),
    ])
    .join('\n');
}

// A `...` for lines left out, indented like the line it stands next to.
const gap = (line: string) => `${line.slice(0, line.search(/\S|$/))}...`;

const muted = (line: string) => color.muted(`  ${line}`);

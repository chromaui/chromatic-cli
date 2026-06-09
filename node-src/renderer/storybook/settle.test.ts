import { describe, expect, it } from 'vitest';

import { settle } from './settle';

const ESC = String.fromCodePoint(27);
const BEL = String.fromCodePoint(7);
const csi = (code: string) => `${ESC}[${code}`;
const gray = (text: string) => `${csi('90m')}${text}${csi('39m')}`;
const green = (text: string) => `${csi('32m')}${text}${csi('39m')}`;
const red = (text: string) => `${csi('31m')}${text}${csi('39m')}`;
const dim = (text: string) => `${csi('2m')}${text}${csi('22m')}`;

// The cursor-erase block Clack emits to collapse a 3-line pending region (bar + title + message)
// before redrawing the final lines: erase the trailing line, walk up 3 rows erasing each, return to
// column 0. Captured verbatim from `@clack/prompts` with a TTY sink.
const ERASE_BLOCK = `${csi('2K')}${csi('1A')}${csi('2K')}${csi('1A')}${csi('2K')}${csi('1A')}${csi('2K')}${csi('G')}`;

const introFrame = `${gray('┌')}  Chromatic CLI v1.2.3\n${gray('│')}\n`;

describe('settle', () => {
  it('collapses a success erase-block, dropping the pending title and message', () => {
    const raw =
      introFrame +
      `${green('◇')}  Authenticating with Chromatic\n` +
      `${gray('│')}  ${dim("Using project token '****b49xnld'")}\n` +
      ERASE_BLOCK +
      `${gray('│')}\n` +
      `${green('◆')}  Authenticated with Chromatic\n` +
      `${gray('│')}  Using project token '****b49xnld'\n`;

    expect(settle(raw)).toBe(
      `${gray('┌')}  Chromatic CLI v1.2.3\n` +
        `${gray('│')}\n` +
        `${green('◆')}  Authenticated with Chromatic\n` +
        `${gray('│')}  Using project token '****b49xnld'`
    );
  });

  it('collapses an error erase-block', () => {
    const raw =
      introFrame +
      `${green('◇')}  Authenticating with Chromatic\n` +
      `${gray('│')}  ${dim('Invalid project token')}\n` +
      ERASE_BLOCK +
      `${gray('│')}\n` +
      `${red('■')}  Failed to authenticate with Chromatic\n` +
      `${gray('│')}  Invalid project token '3cm6b49xnld'\n`;

    const settled = settle(raw);
    expect(settled).toContain(`${red('■')}  Failed to authenticate with Chromatic`);
    expect(settled).not.toContain('◇');
    expect(settled).not.toContain('Authenticating');
  });

  it('passes a pending frame through unchanged (no cursor ops), minus the trailing newline', () => {
    const raw =
      introFrame +
      `${green('◇')}  Authenticating with Chromatic\n` +
      `${gray('│')}  ${dim('Connecting to https://index.chromatic.com')}\n`;

    expect(settle(raw)).toBe(raw.replace(/\n+$/, ''));
  });

  it('preserves OSC 8 hyperlink sequences verbatim', () => {
    const link = `${ESC}]8;;https://www.chromatic.com/docs/${BEL}docs${ESC}]8;;${BEL}`;
    const raw = `${gray('│')}  ${link}\n`;

    expect(settle(raw)).toContain(link);
  });

  it('preserves SGR color sequences verbatim', () => {
    const raw = `${green('passed')} and ${red('failed')}\n`;

    expect(settle(raw)).toBe(`${green('passed')} and ${red('failed')}`);
  });

  it('preserves multi-line output in the settled frame', () => {
    const raw = `line one\nline two\nline three\n`;

    expect(settle(raw)).toBe('line one\nline two\nline three');
  });

  it('clamps cursor-up at the top of the buffer', () => {
    const raw = `first\nsecond\n${csi('9A')}${csi('2K')}replaced\n`;

    expect(settle(raw)).toBe('replaced\nsecond');
  });
});

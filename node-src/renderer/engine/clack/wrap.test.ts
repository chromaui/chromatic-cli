import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLACK_PREFIX_RESERVE,
  getTerminalWidth,
  MAX_OPTIMAL_WIDTH,
  MIN_CONTENT_WIDTH,
  protectUrls,
  supportsHyperlinks,
  wrapTextForClack,
} from './wrap';

// Mirrors the wrap-width formula in wrap.ts so expectations track the same constants as the source.
function targetWidthFor(terminalWidth: number): number {
  return Math.min(
    Math.max(terminalWidth - CLACK_PREFIX_RESERVE, MIN_CONTENT_WIDTH),
    MAX_OPTIMAL_WIDTH
  );
}

// protectUrls truncates an over-long URL's display text to `slice(0, maxLength - 3) + '...'`.
const ELLIPSIS = '...';
function truncatedDisplay(url: string, maxLength: number): string {
  return url.slice(0, Math.max(0, maxLength - ELLIPSIS.length)) + ELLIPSIS;
}

const ESC = '\u001B';
const BEL = '\u0007';

// OSC 8 hyperlink format emitted by protectUrls: ESC]8;;<target>BEL<display>ESC]8;;BEL
function link(url: string, display: string = url): string {
  return `${ESC}]8;;${url}${BEL}${display}${ESC}]8;;${BEL}`;
}

// SGR color/style sequence: ESC[<params>m. Built from the ESC constant to avoid a literal control
// character in a regex (which our lint config rejects).
const SGR_REGEX = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

function stripSgr(input: string): string {
  return input.replaceAll(SGR_REGEX, '');
}

function visibleLength(input: string): number {
  return stripSgr(input).length;
}

function setColumns(value: number | undefined): void {
  Object.defineProperty(process.stdout, 'columns', { value, configurable: true });
}

beforeEach(() => {
  setColumns(80);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getTerminalWidth', () => {
  it('returns process.stdout.columns when available', () => {
    setColumns(120);
    expect(getTerminalWidth()).toBe(120);
  });

  it('falls back to 80 when columns is undefined', () => {
    setColumns(undefined);
    expect(getTerminalWidth()).toBe(80);
  });

  it('falls back to 80 when reading columns throws', () => {
    Object.defineProperty(process.stdout, 'columns', {
      get: () => {
        throw new Error('Test error');
      },
      configurable: true,
    });
    expect(getTerminalWidth()).toBe(80);
  });
});

describe('supportsHyperlinks', () => {
  it('returns true for iTerm.app >= 3.1', () => {
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
    vi.stubEnv('TERM_PROGRAM_VERSION', '3.4.0');
    expect(supportsHyperlinks()).toBe(true);
  });

  it('returns false for iTerm.app < 3.1', () => {
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
    vi.stubEnv('TERM_PROGRAM_VERSION', '3.0.0');
    expect(supportsHyperlinks()).toBe(false);
  });

  it('returns true for iTerm.app without a version', () => {
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
    vi.stubEnv('TERM_PROGRAM_VERSION', '');
    expect(supportsHyperlinks()).toBe(true);
  });

  it('returns false for Apple_Terminal (macOS Terminal.app)', () => {
    vi.stubEnv('TERM_PROGRAM', 'Apple_Terminal');
    expect(supportsHyperlinks()).toBe(false);
  });

  it('returns true for unknown terminals', () => {
    vi.stubEnv('TERM_PROGRAM', '');
    expect(supportsHyperlinks()).toBe(true);
  });
});

describe('wrapTextForClack', () => {
  it('wraps long text within the target width', () => {
    const text =
      'This is a very long line of text that should be wrapped to fit within the specified width and not exceed the limit';
    const targetWidth = targetWidthFor(50);
    const result = wrapTextForClack(text, 50);
    const lines = result.split('\n');

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(visibleLength(line)).toBeLessThanOrEqual(targetWidth);
      expect(visibleLength(line)).toBeGreaterThan(0);
    }

    const flattened = lines.join(' ').replaceAll(/\s+/g, ' ').trim();
    for (const word of text.split(/\s+/)) expect(flattened).toContain(word);
  });

  it('leaves text shorter than the target width unchanged', () => {
    const text = 'Short text';
    const result = wrapTextForClack(text, 80);
    expect(result).toBe(text);
    expect(result).not.toContain('\n');
  });

  it('preserves ANSI color codes across line breaks', () => {
    const text = `${ESC}[31mThis is red text that is long enough to wrap${ESC}[0m and this is normal text`;
    const result = wrapTextForClack(text, 30);

    expect(result).toMatch(/\[31m/);
    expect(result).toMatch(/\[0m/);
    expect(stripSgr(result)).toContain('This is red text');
    expect(stripSgr(result)).toContain('normal text');
    expect(result.split('\n').length).toBeGreaterThan(1);
  });

  it('handles empty text', () => {
    expect(wrapTextForClack('')).toBe('');
  });

  it('preserves explicit newlines in the original text', () => {
    const text = 'Line 1\nLine 2\nLine 3';
    const lines = wrapTextForClack(text, 80).split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Line 1');
    expect(lines[1]).toContain('Line 2');
    expect(lines[2]).toContain('Line 3');
  });

  it('breaks a long space-less token into multiple lines', () => {
    const token = 'foo'.repeat(30); // 90 chars, no spaces
    const targetWidth = targetWidthFor(80);
    const result = wrapTextForClack(token, 80);
    const lines = result.split('\n');

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(targetWidth);
    // No spaces means no trimming at break points, so the token reassembles exactly.
    expect(lines.join('')).toBe(token);
  });

  it('preserves a mix of ANSI codes and symbols while respecting width', () => {
    const text = `${ESC}[32m✔${ESC}[0m ${ESC}[1mBold text${ESC}[0m with normal text and more content`;
    const result = wrapTextForClack(text, 50);

    expect(result).toMatch(/\[32m/);
    expect(result).toMatch(/\[1m/);
    expect(result).toMatch(/\[0m/);
    expect(stripSgr(result)).toContain('✔');
    expect(stripSgr(result)).toContain('Bold text');
    expect(stripSgr(result)).toContain('normal text');

    for (const line of result.split('\n'))
      expect(visibleLength(line)).toBeLessThanOrEqual(targetWidthFor(50));
  });

  it('preserves multiple consecutive ANSI codes', () => {
    const text = `${ESC}[1m${ESC}[31m${ESC}[4mMultiple codes${ESC}[0m normal text continues here`;
    const result = wrapTextForClack(text, 50);

    expect(result).toMatch(/\[1m/);
    expect(result).toMatch(/\[31m/);
    expect(result).toMatch(/\[4m/);
    expect(result).toMatch(/\[0m/);
    expect(stripSgr(result)).toContain('Multiple codes');
    expect(stripSgr(result)).toContain('normal text continues');
  });

  it('preserves color state and content order across resets', () => {
    const text = `${ESC}[31mRed${ESC}[0m normal ${ESC}[32mGreen${ESC}[0m text continues`;
    const result = wrapTextForClack(text, 50);

    expect(result).toMatch(/\[31m/);
    expect(result).toMatch(/\[32m/);
    expect(result.match(/\[0m/g)?.length).toBeGreaterThanOrEqual(2);

    const clean = stripSgr(result);
    expect(clean.indexOf('Red')).toBeLessThan(clean.indexOf('normal'));
    expect(clean.indexOf('normal')).toBeLessThan(clean.indexOf('Green'));
  });
});

describe('protectUrls', () => {
  beforeEach(() => {
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
    vi.stubEnv('TERM_PROGRAM_VERSION', '3.4.0');
  });

  it('returns text unchanged when no URLs are present', () => {
    const text = 'This is just plain text without any URLs';
    expect(protectUrls(text)).toBe(text);
  });

  it('wraps a URL in an OSC 8 hyperlink when supported', () => {
    const result = protectUrls('Visit https://example.com for more info');
    expect(result).toBe(`Visit ${link('https://example.com')} for more info`);
  });

  it('handles multiple URLs in the same text', () => {
    const result = protectUrls('Check https://example.com and https://test.org for details');
    expect(result).toBe(
      `Check ${link('https://example.com')} and ${link('https://test.org')} for details`
    );
  });

  it('truncates URLs that exceed maxUrlLength while keeping the full target', () => {
    const longUrl =
      'https://example.com/very/long/path/that/exceeds/the/maximum/allowed/length/for/urls';
    const maxUrlLength = 30;
    const result = protectUrls(`Visit ${longUrl} for details`, { maxUrlLength });
    expect(result).toBe(
      `Visit ${link(longUrl, truncatedDisplay(longUrl, maxUrlLength))} for details`
    );
  });

  it('respects maxLineWidth when computing the effective max length', () => {
    const url = 'https://example.com/path/that/might/be/too/long/for/line';
    const prefix = 'Prefix text before ';
    const maxLineWidth = 50;
    const result = protectUrls(`${prefix}${url}`, { maxLineWidth });
    // effectiveMaxLength is clamped to the space left on the line after the prefix.
    const effectiveMaxLength = maxLineWidth - prefix.length;
    expect(result).toBe(`${prefix}${link(url, truncatedDisplay(url, effectiveMaxLength))}`);
  });

  it('leaves URLs already inside an existing hyperlink untouched', () => {
    const existing = `${ESC}]8;;https://example.com${BEL}click here${ESC}]8;;${BEL}`;
    const text = `Check out ${existing} for info`;
    expect(protectUrls(text)).toBe(text);
  });

  it('handles URLs with query parameters and fragments', () => {
    const url = 'https://example.com/path?param=value&other=test#section';
    expect(protectUrls(`Visit ${url} for details`)).toBe(`Visit ${link(url)} for details`);
  });

  it('keeps the full URL when the available space falls below the minimum length', () => {
    const url = 'https://example.com/short';
    const text = `${'A'.repeat(100)} ${url}`;
    expect(protectUrls(text, { maxLineWidth: 50 })).toContain(link(url));
  });

  it('computes line position correctly across newlines', () => {
    const url = 'https://example.com';
    const result = protectUrls(`First line\nSecond line with ${url} here`);
    expect(result).toBe(`First line\nSecond line with ${link(url)} here`);
  });

  it('leaves text unchanged when the terminal does not support hyperlinks', () => {
    vi.stubEnv('TERM_PROGRAM', 'Apple_Terminal');
    vi.stubEnv('TERM_PROGRAM_VERSION', '');

    const text = 'Visit https://example.com for info';
    const result = protectUrls(text);
    expect(result).toBe(text);
    expect(result).not.toContain(`${ESC}]8;;`);
  });

  it('handles complex URLs with ports and authentication', () => {
    const url = 'https://user:pass@example.com:8080/path';
    expect(protectUrls(`Connect to ${url}`)).toContain(link(url));
  });
});

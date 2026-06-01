import wrapAnsi from 'wrap-ansi';

const DEFAULT_WIDTH = 80;
const MAX_OPTIMAL_WIDTH = 80;
// Reserve columns for Clack's left-edge formatting (vertical bar + indent).
const CLACK_PREFIX_RESERVE = 10;
const MIN_CONTENT_WIDTH = 40;
const MIN_URL_LENGTH = 20;

// Matches CSI SGR sequences and OSC 8 hyperlink start/end markers. The control chars in the
// pattern are the whole point of the regex.
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\u001B\[[0-9;]*m|\u001B\]8;;[^\u0007]*\u0007|\u001B\]8;;\u0007/g;
// eslint-disable-next-line no-control-regex
const URL_REGEX = /(https?:\/\/[^\s\u0000-\u001F\u007F]+)/g;

const OSC8_START = '\u001B]8;;';
const OSC8_BELL = '\u0007';
const OSC8_END = `${OSC8_START}${OSC8_BELL}`;

/**
 * @returns The current terminal width, falling back to 80 if it can't be determined.
 */
export function getTerminalWidth(): number {
  try {
    return process.stdout.columns || DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

/**
 * @returns Whether the current terminal supports OSC 8 hyperlinks. macOS Terminal.app is the
 * notable holdout among modern terminals.
 */
export function supportsHyperlinks(): boolean {
  try {
    const termProgram = (process.env.TERM_PROGRAM || '').trim();
    const termProgramVersion = (process.env.TERM_PROGRAM_VERSION || '').trim();

    switch (termProgram) {
      case 'iTerm.app': {
        if (termProgramVersion) {
          const [major, minor] = termProgramVersion.split('.').map(Number);
          return major > 3 || (major === 3 && minor >= 1);
        }
        return true;
      }
      case 'Apple_Terminal':
        return false;
      default:
        return true;
    }
  } catch {
    return false;
  }
}

function stripAnsi(input: string): string {
  return input.replaceAll(ANSI_REGEX, '');
}

function getVisibleLength(input: string): number {
  return stripAnsi(input).length;
}

/**
 * Find URLs in text and wrap them in OSC 8 hyperlinks (truncating display text if needed) so
 * line-wrapping doesn't shatter them across lines.
 *
 * @param text The raw text potentially containing URLs.
 * @param options Optional width budgets.
 * @param options.maxUrlLength Maximum visible URL length before truncation.
 * @param options.maxLineWidth Total width of the line; informs available space for the URL.
 *
 * @returns The text with URLs replaced by OSC 8 sequences (when supported).
 */
export function protectUrls(
  text: string,
  options?: { maxUrlLength?: number; maxLineWidth?: number }
): string {
  const maxLineWidth = options?.maxLineWidth ?? getTerminalWidth();
  const defaultMaxUrlLength = Math.floor(getTerminalWidth() * 0.8);
  const useHyperlinks = supportsHyperlinks();

  return text.replaceAll(URL_REGEX, (match: string, capturedUrl: string, offset: number) => {
    if (!useHyperlinks) return match;
    if (isInsideExistingHyperlink(text, offset)) return match;

    const prefixLength = getVisibleLength(currentLinePrefix(text, offset));
    const availableSpace = maxLineWidth - prefixLength;
    const configuredMax = options?.maxUrlLength ?? defaultMaxUrlLength;
    let effectiveMaxLength = Math.min(configuredMax, defaultMaxUrlLength, availableSpace);

    if (capturedUrl.length <= MIN_URL_LENGTH) {
      effectiveMaxLength = capturedUrl.length;
    } else if (effectiveMaxLength < MIN_URL_LENGTH) {
      effectiveMaxLength = capturedUrl.length;
    }

    if (capturedUrl.length > effectiveMaxLength) {
      const truncatedText = capturedUrl.slice(0, Math.max(0, effectiveMaxLength - 3)) + '...';
      return `${OSC8_START}${capturedUrl}${OSC8_BELL}${truncatedText}${OSC8_END}`;
    }
    return `${OSC8_START}${capturedUrl}${OSC8_BELL}${capturedUrl}${OSC8_END}`;
  });
}

function isInsideExistingHyperlink(text: string, offset: number): boolean {
  let searchPos = 0;
  while (true) {
    const hyperlinkStart = text.indexOf(OSC8_START, searchPos);
    if (hyperlinkStart === -1) return false;
    const hyperlinkEnd = text.indexOf(OSC8_END, hyperlinkStart);
    if (hyperlinkEnd === -1) {
      searchPos = hyperlinkStart + 1;
      continue;
    }
    if (offset >= hyperlinkStart && offset < hyperlinkEnd + OSC8_END.length) return true;
    searchPos = hyperlinkEnd + 1;
  }
}

function currentLinePrefix(text: string, offset: number): string {
  const textBeforeUrl = text.slice(0, Math.max(0, offset));
  const lastNewlineIndex = textBeforeUrl.lastIndexOf('\n');
  return lastNewlineIndex === -1
    ? textBeforeUrl
    : textBeforeUrl.slice(Math.max(0, lastNewlineIndex + 1));
}

/**
 * Wrap a multi-line string for safe rendering by Clack, capping the line width and protecting URLs
 * from being split. Each output line stays clear of Clack's left-edge formatting reserve.
 *
 * @param text The text to wrap.
 * @param width Optional explicit width; defaults to the current terminal width.
 *
 * @returns A wrapped string ready for `clack.log.*` or `note(...)` output.
 */
export function wrapTextForClack(text: string, width?: number): string {
  const terminalWidth = width || getTerminalWidth();
  const contentWidth = Math.max(terminalWidth - CLACK_PREFIX_RESERVE, MIN_CONTENT_WIDTH);
  const targetWidth = Math.min(contentWidth, MAX_OPTIMAL_WIDTH);

  const protectedText = protectUrls(text, { maxLineWidth: targetWidth });
  return wrapAnsi(protectedText, targetWidth, { hard: false, trim: false });
}

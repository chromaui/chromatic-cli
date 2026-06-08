const ESC = '\u001B';
const CSI = `${ESC}[`;
const OSC = `${ESC}]`;
const BEL = '\u0007';

/**
 * A cursor over an array of logical lines. Writes overwrite from the cursor to the end of the
 * current line; cursor/erase ops reposition or clear lines. ANSI content (SGR, OSC 8) is opaque to
 * the buffer — it's written as ordinary characters and so survives verbatim.
 */
class LineBuffer {
  private lines: string[] = [''];
  private row = 0;
  private col = 0;

  write(text: string): void {
    const line = this.lines[this.row];
    this.lines[this.row] = line.slice(0, this.col) + text;
    this.col += text.length;
  }

  newline(): void {
    this.row += 1;
    if (this.row === this.lines.length) this.lines.push('');
    this.col = 0;
  }

  eraseLine(): void {
    this.lines[this.row] = '';
  }

  cursorUp(count: number): void {
    this.row = Math.max(0, this.row - count);
  }

  cursorColumn(column: number): void {
    this.col = Math.max(0, column - 1);
  }

  toString(): string {
    const lines = [...this.lines];
    while (lines.length > 1 && lines.at(-1) === '') lines.pop();
    return lines.join('\n');
  }
}

// CSI sequence final byte → the buffer op it performs. `m` (SGR) writes itself back as content so
// colors survive; absent entries (e.g. `J`, `?25l`) are dropped as no-ops.
const CSI_DISPATCH: Record<string, (buffer: LineBuffer, parameter: number, raw: string) => void> = {
  m: (buffer, _parameter, raw) => buffer.write(raw),
  K: (buffer) => buffer.eraseLine(),
  A: (buffer, parameter) => buffer.cursorUp(parameter || 1),
  G: (buffer, parameter) => buffer.cursorColumn(parameter || 1),
};

const CSI_FINAL = /[A-Za-z]/;

/**
 * Collapse a captured live-terminal Clack stream into its settled final frame.
 *
 * The stream interleaves text/SGR/OSC 8 with cursor and erase sequences that Clack uses to redraw a
 * task log's pending region into its final success/error lines. Replaying only the cursor/erase ops
 * over a line buffer yields what the terminal would ultimately display, with color and hyperlinks
 * preserved.
 *
 * @param raw The raw ANSI stream captured from the Clack sink.
 *
 * @returns The settled frame: a newline-joined string with no trailing blank lines.
 */
export function settle(raw: string): string {
  const buffer = new LineBuffer();
  let index = 0;

  while (index < raw.length) {
    if (raw.startsWith(CSI, index)) {
      index = consumeCsi(raw, index, buffer);
    } else if (raw.startsWith(OSC, index)) {
      index = consumeOsc(raw, index, buffer);
    } else if (raw[index] === '\n') {
      buffer.newline();
      index += 1;
    } else if (raw[index] === ESC) {
      index += 1; // lone/unrecognized escape — drop
    } else {
      buffer.write(raw[index]);
      index += 1;
    }
  }

  return buffer.toString();
}

function consumeCsi(raw: string, start: number, buffer: LineBuffer): number {
  let cursor = start + CSI.length;
  while (cursor < raw.length && !CSI_FINAL.test(raw[cursor])) cursor += 1;
  if (cursor >= raw.length) return raw.length;

  const final = raw[cursor];
  const parameters = raw.slice(start + CSI.length, cursor);
  const sequence = raw.slice(start, cursor + 1);
  CSI_DISPATCH[final]?.(buffer, Number.parseInt(parameters, 10) || 0, sequence);
  return cursor + 1;
}

// OSC 8 hyperlinks (`ESC ] 8 ; ; URL BEL`) are content, not cursor control. Pass the whole sequence
// through verbatim, including the BEL terminator, so the hyperlink survives settling intact.
function consumeOsc(raw: string, start: number, buffer: LineBuffer): number {
  const bell = raw.indexOf(BEL, start);
  const end = bell === -1 ? raw.length : bell + 1;
  buffer.write(raw.slice(start, end));
  return end;
}

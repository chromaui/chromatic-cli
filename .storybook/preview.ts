/* eslint-env browser */
import type { Preview } from '@storybook/html-vite';

import ansiHTML from 'ansi-html';
import chalk from 'chalk';

ansiHTML.setColors({
  reset: ['c0c4cd', '16242c'],
  black: '16252b',
  red: 'ec5e66',
  green: '99c793',
  yellow: 'fac862',
  blue: '6699cb',
  magenta: 'c593c4',
  cyan: '5fb3b2',
});

// @ts-expect-error chalk is not fully typed
chalk.enabled = true;
chalk.level = 3;

// OSC 8 hyperlink: ESC]8;;URL BEL TEXT ESC]8;;BEL. ansi-html only understands SGR codes, so the
// escape bytes would otherwise leak through as literal "]8;;URL...]8;;" text. Terminals show only
// the display text (the link is invisible), so collapse each sequence to its text to match the CLI.
const ESC = String.fromCodePoint(27);
const BEL = String.fromCodePoint(7);
const OSC8_HYPERLINK = new RegExp(`${ESC}\\]8;;.*?${BEL}(.*?)${ESC}\\]8;;${BEL}`, 'g');

function renderCliAnsi(value) {
  const withoutHyperlinks = value.replace(OSC8_HYPERLINK, (_match, text) => text);
  return ansiHTML(withoutHyperlinks);
}

const decorators = [
  (storyFn, { kind }) => {
    const value = storyFn();
    if (kind.startsWith('CLI/')) {
      document.body.style.backgroundColor = '#16242c';
      return `<pre class="code-style"><code>${renderCliAnsi(value)}</code></pre>`;
    }
    if (kind.startsWith('HTML/')) {
      document.body.style.backgroundColor = '#F6F9FC';
      return `<div class="html-style">${value}</div>`;
    }
    document.body.style.backgroundColor = 'paleturquoise';
    return value;
  },
];

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
  decorators,
  tags: [ 'autodocs' ] ,
};

export default preview;

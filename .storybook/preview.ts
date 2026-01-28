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

const decorators = [
  (storyFn, { kind }) => {
    const value = storyFn();
    console.log({value, kind});
    if (kind.startsWith('CLI/')) {
      document.body.style.backgroundColor = '#16242c';
      return `<pre><code class="code-style">${ansiHTML(value)}</code></pre>`;
    }
    if (kind.startsWith('HTML/')) {
      document.body.style.backgroundColor = '#F6F9FC';

      return `<pre><div class="html-style">${value}</div></pre>`;
    }
    document.body.style.backgroundColor = 'paleturquoise';
    return value;
  },
];

 const tags = ['autodocs', 'autodocs'];

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
  decorators,
  tags,
};

export default preview;


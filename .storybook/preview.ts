/* eslint-env browser */

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

const codeStyle = {
  display: 'inline-block',
  margin: 0,
  padding: '1rem',
  fontSize: 12,
  fontFamily: '"Source Code Pro", monospace',
  whiteSpace: 'pre-wrap' as const,
  lineHeight: '1rem',
  color: '#c0c4cd',
};

const htmlStyle = {
  fontFamily: "'Nunito Sans', sans-serif",
  fontSize: 14,
  lineHeight: '1',
  color: '#5C6870',
  padding: 20,
};

export const parameters = {
  layout: 'fullscreen',
  backgrounds: {
    options: [
      { name: 'dark', value: '#16242c' },
      { name: 'light', value: '#F6F9FC' },
      { name: 'paleturquoise', value: '#AFEEEE' },
    ],
  },
};

export const initialGlobals = {
  backgrounds: {
    value: 'dark',
  },
};

export const decorators = [
  (storyFn, { kind }) => {
    if (kind.startsWith('CLI/')) {
      return `<code style=${codeStyle}>${ansiHTML(storyFn())}</code>`;
    }
    if (kind.startsWith('HTML/')) {
      return `<div style=${htmlStyle}>${storyFn()}</div>`;
    }
    return storyFn();
  },
];

/* eslint-env browser */
import type { Preview } from '@storybook/react';

import ansiHTML from 'ansi-html';
import chalk from 'chalk';
import React from 'react';

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

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
};

export default preview;

export const decorators = [
  (storyFn, { kind }) => {
    if (kind.startsWith('CLI/')) {
      document.body.style.backgroundColor = '#16242c';
      return <code style={codeStyle} dangerouslySetInnerHTML={{ __html: ansiHTML(storyFn()) }} />;
    }
    if (kind.startsWith('HTML/')) {
      document.body.style.backgroundColor = '#F6F9FC';
      return <div style={htmlStyle} dangerouslySetInnerHTML={{ __html: storyFn() }} />;
    }
    document.body.style.backgroundColor = 'paleturquoise';
    return storyFn();
  },
];

export const render = (args, { component }) => component(args);
export const tags = ['autodocs', 'autodocs'];

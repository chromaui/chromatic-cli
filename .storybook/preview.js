import { addDecorator } from '@storybook/react';
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

chalk.enabled = true;
chalk.level = 3;

const style = {
  display: 'inline-block',
  margin: 0,
  padding: '1rem',
  fontSize: 12,
  fontFamily: '"Source Code Pro", monospace',
  whiteSpace: 'pre-wrap',
  lineHeight: '1rem',
  color: '#c0c4cd',
};

addDecorator((storyFn, { kind }) => {
  if (kind.startsWith('CLI/')) {
    document.body.style.backgroundColor = '#16242c';
    return <code style={style} dangerouslySetInnerHTML={{ __html: ansiHTML(storyFn()) }} />;
  }
  document.body.style.backgroundColor = 'paleturquoise';
  return storyFn();
});

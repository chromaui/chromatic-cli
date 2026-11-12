import chalk from 'chalk';

const isSupported =
  process.platform !== 'win32' || process.env.CI || process.env.TERM === 'xterm-256color';

const cross = isSupported ? '✖' : '×';
const check = isSupported ? '✔' : '√';

export const info = chalk.blue(isSupported ? 'ℹ' : 'i');
export const success = chalk.green(check);
export const warning = chalk.yellow(isSupported ? '⚠' : '‼');
export const error = chalk.red(cross);

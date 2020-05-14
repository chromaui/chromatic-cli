import chalk from 'chalk';

const isSupported =
  process.platform !== 'win32' || process.env.CI || process.env.TERM === 'xterm-256color';

export const cross = isSupported ? '✖' : '×';
export const check = isSupported ? '✔' : '√';
export const arrowDown = `↓`;
export const arrowRight = `→`;
export const chevronRight = `›`;
export const spinner = `⠋`;

export const info = chalk.blue(isSupported ? 'ℹ' : 'i');
export const success = chalk.green(check);
export const warning = chalk.yellow(isSupported ? '⚠' : '‼');
export const error = chalk.red(cross);

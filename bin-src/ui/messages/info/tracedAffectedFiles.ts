import chalk from 'chalk';
import pluralize from 'pluralize';
import { Context, Module } from '../../../types';

import { info } from '../../components/icons';

const printFilePath = (filepath: string, basedir: string, expanded: boolean) => {
  const result =
    basedir === '.' ? filepath : filepath.replace(`${basedir}/`, chalk.dim(`${basedir}/`));
  return result
    .split('/')
    .map((part, index, parts) => {
      if (index < parts.length - 1) return part;
      const [, file, suffix = ''] = part.match(/^(.+?)( \+ \d+ modules)?$/);
      return chalk.bold(file) + (expanded ? chalk.magenta(suffix) : chalk.dim(suffix));
    })
    .join('/');
};

export const rootDirNote = `The root directory of your project:`;
export const baseDirNote = `The base directory (The relative path from the root to the storybook config root):`;
export const storybookDirNote = `The storybook directory (The directory can either be at the root or in a sub-directory):`;
export const traceSuggestions = `If you are having trouble with tracing, please check the following:\n
  1. Make sure you have the correct root path, base path, and storybook path.\n
  2. Make sure you have the correct storybook config file.\n
  3. Make sure you have the correct storybook config file path.\nYou can either set the flags storybook-base-dir or storybook-config-dir to help TurboSnap find the correct storybook config file.\n
  `;

export default (
  ctx: Context,
  {
    changedFiles,
    affectedModules,
    modulesByName,
    normalize,
  }: {
    changedFiles: string[];
    affectedModules: Record<string, string[]>;
    modulesByName: Record<string, Module>;
    normalize: (name: string) => string;
  }
) => {
  const flag = ctx.log === (console as any) ? '--mode (-m)' : '--trace-changed';
  const basedir = ctx.options.storybookBaseDir || '.';
  const storybookConfigDir = ctx.options.storybookConfigDir || '.storybook';
  const expanded = ctx.options.traceChanged === 'expanded';
  const printPath = (filepath: string) => printFilePath(filepath, basedir, expanded);

  const changed = pluralize('changed files', changedFiles.length, true);
  const affected = pluralize('affected story files', Object.keys(affectedModules).length, true);

  let directoryDebug = '';

  if (expanded) {
    const bailReason = ctx.turboSnap?.bailReason
      ? `${chalk.magenta('Bail Reason:')} ${ctx.turboSnap.bailReason}\n\n`
      : '';
    const rootPath = `${chalk.magenta(rootDirNote)} ${ctx.turboSnap.rootPath}\n\n`;
    const basePath = `${chalk.magenta(baseDirNote)} ${basedir}\n\n`;
    const storybookPath = `${chalk.magenta(storybookDirNote)} ${storybookConfigDir}\n\n`;
    const untracedNotice =
      ctx.untracedFiles && ctx.untracedFiles.length > 0
        ? `${chalk.magenta(
            `We detected some untraced files, this may affect your traced changes as 
    the untraced flag instructs TurboSnap to not trace dependencies for the files:`
          )} \n  ${ctx.untracedFiles.join(',')}\n\n\n`
        : '';
    directoryDebug = `${rootPath}${basePath}${storybookPath}${bailReason}${untracedNotice}${traceSuggestions}`;
  }

  const summary = chalk`${
    ctx.options.traceChanged === 'expanded' ? directoryDebug : ''
  } ${info} Traced {bold ${changed}} to {bold ${affected}}`;

  if (ctx.options.traceChanged === 'compact') {
    let submodules = false;
    const affectedFiles = Object.values(affectedModules).map(([firstFile, ...otherFiles]) => {
      if (!otherFiles.length) return firstFile;
      submodules = true;
      return `${firstFile} + ${otherFiles.length} modules`;
    });
    const listing = affectedFiles.map((f) => chalk`— ${printPath(f)}`).join('\n');
    const note = submodules
      ? chalk`\nSet {bold ${flag}} to {bold 'expanded'} to reveal underlying modules.`
      : chalk`\nSet {bold ${flag}} to reveal how these files are affected.`;
    return `${summary}:\n${listing}${note}`;
  }

  const printModules = (moduleName, indent = '') => {
    if (!expanded) return '';
    const { modules } = modulesByName[moduleName] || {};
    return modules
      ? modules.reduce((acc, mod) => chalk`${acc}\n${indent}  ⎸  {dim ${normalize(mod.name)}}`, '')
      : '';
  };

  const seen = new Set();
  const traces = Array.from(ctx.turboSnap.tracedPaths).map((p) => {
    const parts = p.split('\n');
    return parts
      .reduce((acc, part, index) => {
        if (index === 0) return chalk`— ${printPath(part)} {cyan [changed]}${printModules(part)}`;
        const indent = '  '.repeat(index);
        let note = '';
        if (index === parts.length - 1) {
          if (seen.has(part)) note = chalk` {yellow [duplicate]}`;
          else seen.add(part);
        }
        return chalk`${
          expanded ? `File Path: ${part}\n\nBase Directory: ${basedir}\n\n` : ''
        }${acc}\n${indent}∟ ${printPath(part)}${note}${printModules(part, indent)}`;
      }, '')
      .concat(chalk`\n${'  '.repeat(parts.length)}∟ {cyan [story index]}`);
  });

  const note = chalk`\n\nSet {bold ${flag}} to {bold 'expanded'} to reveal underlying modules.`;
  return `${summary}:\n\n${traces.join('\n\n')}${expanded ? '' : note}`;
};

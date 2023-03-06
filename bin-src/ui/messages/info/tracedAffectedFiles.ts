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
  const expanded = ctx.options.traceChanged === 'expanded';
  const printPath = (filepath: string) => printFilePath(filepath, basedir, expanded);

  const changed = pluralize('changed files', changedFiles.length, true);
  const affected = pluralize('affected story files', Object.keys(affectedModules).length, true);
  const directoryDebug = chalk`Root Directory: ${ctx.turboSnap.rootPath}\n\n Base Directory: ${ctx.turboSnap.baseDir}\n\n Storybook Directory: ${ctx.turboSnap.storybookDir}\n\n ${ctx.turboSnap.tracedPaths}\n\n`;
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
        return chalk`File Path: ${part}\n\nBase Directory: ${basedir}\n\n${acc}\n${indent}∟ ${printPath(
          part
        )}${note}${printModules(part, indent)}`;
      }, '')
      .concat(chalk`\n${'  '.repeat(parts.length)}∟ {cyan [story index]}`);
  });

  const note = chalk`\n\nSet {bold ${flag}} to {bold 'expanded'} to reveal underlying modules.`;
  return `${summary}:\n\n${traces.join('\n\n')}${expanded ? '' : note}`;
};

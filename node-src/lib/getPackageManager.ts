import { getCliCommand, parseNa, parseNr } from '@antfu/ni';

import { Context } from '../types';

// 'npm' | 'pnpm' | 'yarn' | 'bun'
export const getPackageManagerName = async () => {
  return getCliCommand(parseNa, [], { programmatic: true });
};

// e.g. `npm run build-storybook`
export const getPackageManagerRunCommand = async (args: string[]) => {
  return getCliCommand(parseNr, args, { programmatic: true });
};

// e.g. `8.19.2`
export const getPackageManagerVersion = async (
  ctx: Pick<Context, 'ports'>,
  packageManager: string
) => {
  if (!packageManager) {
    throw new Error('No package manager provided');
  }

  const command = `${packageManager} --version`;
  const { stdout } = await ctx.ports.proc.run(command);

  if (stdout === undefined) {
    throw new Error(`Unexpected missing output for command: '${command}'`);
  }

  const [output] = (stdout.toString() as string).trim().split('\n', 1);
  return output.trim().replace(/^v/, '');
};

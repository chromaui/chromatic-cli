import { getCliCommand, Runner } from '@antfu/ni';

import { Context } from '../types';
import missingDependency from '../ui/messages/errors/missingDependency';
import { exitCodes, setExitCode } from './setExitCode';
import { failed } from '../ui/tasks/build';

// ni doesn't currently have a "exec" command (equivalent to `npm exec`).
// It has a "download & exec" command (equivalent to `npx`).
// We should probably PR this up to ni
const parseNexec = <Runner>((agent, args) => {
  const map = {
    npm: 'npm exec ${0}',
    yarn: 'yarn run ${0}',
    'yarn@berry': 'yarn run ${0}',
    pnpm: 'pnpm exec ${0}',
  };

  const quote = (arg: string) =>
    !arg.startsWith('--') && arg.includes(' ') ? JSON.stringify(arg) : arg;

  const command = map[agent];
  if (!command) {
    throw new Error('Unsupported package manager');
  }

  return command.replace('{0}', args.map(quote).join(' ')).trim();
});

export async function getE2eBuildCommand(
  ctx: Context,
  flag: 'playwright' | 'cypress',
  buildCommandOptions: string[]
) {
  const dependencyName = `@chromatic-com/${flag}`;
  try {
    return [
      'node',
      require.resolve(`${dependencyName}/bin/build-archive-storybook`),
      ...buildCommandOptions,
    ].join(' ');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      try {
        return await getCliCommand(
          parseNexec,
          ['build-archive-storybook', ...buildCommandOptions],
          {
            programmatic: true,
          }
        );
      } catch (err) {
        ctx.log.error(missingDependency({ dependencyName, flag }));
        setExitCode(ctx, exitCodes.MISSING_DEPENDENCY, true);
        throw new Error(failed(ctx).output);
      }
    }
    throw err;
  }
}

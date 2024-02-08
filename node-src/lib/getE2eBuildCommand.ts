import { getCliCommand, Runner, AGENTS } from '@antfu/ni';

import { Context } from '../types';
import missingDependency from '../ui/messages/errors/missingDependency';
import { exitCodes, setExitCode } from './setExitCode';
import { failed } from '../ui/tasks/build';

export const buildBinName = 'build-archive-storybook';

// ni doesn't currently have a "exec" command (equivalent to `npm exec`).
// It has a "download & exec" command (equivalent to `npx`).
// We should probably PR this up to ni
const parseNexec = <Runner>((agent, args) => {
  const map: Record<keyof typeof AGENTS, string> = {
    npm: 'npm exec {0}',
    yarn: 'yarn {0}',
    'yarn@berry': 'yarn {0}',
    pnpm: 'pnpm exec {0}',
    'pnpm@6': 'pnpm exec {0}',
    bun: 'bun run {0}',
  };

  const quote = (arg: string) =>
    !arg.startsWith('--') && arg.includes(' ') ? JSON.stringify(arg) : arg;

  const command = map[agent];
  return command.replace('{0}', args.map(quote).join(' ')).trim();
});

export async function getE2eBuildCommand(
  ctx: Context,
  flag: 'playwright' | 'cypress',
  buildCommandOptions: string[]
) {
  console.log('here', ctx.options.inAction);

  // The action cannot "peer depend" on or import anything. So instead, we must attempt to exec
  // the binary directly.
  if (ctx.options.inAction) {
    return await getCliCommand(parseNexec, [buildBinName, ...buildCommandOptions], {
      programmatic: true,
    });
  }

  const dependencyName = `@chromatic-com/${flag}`;
  try {
    return [
      'node',
      require.resolve(`${dependencyName}/bin/${buildBinName}`),
      ...buildCommandOptions,
    ].join(' ');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      ctx.log.error(missingDependency({ dependencyName, flag }));
      setExitCode(ctx, exitCodes.MISSING_DEPENDENCY, true);
      throw new Error(failed(ctx).output);
    }

    throw err;
  }
}

import { AGENTS, getCliCommand, Runner } from '@antfu/ni';

import { Context } from '../types';
import missingDependency from '../ui/messages/errors/missingDependency';
import { failed } from '../ui/tasks/build';
import { exitCodes, setExitCode } from './setExitCode';

export const buildBinName = 'build-archive-storybook';

const quote = (argument: string) =>
  !argument.startsWith('--') && argument.includes(' ') ? JSON.stringify(argument) : argument;

// ni doesn't currently have a "exec" command (equivalent to `npm exec`).
// It has a "download & exec" command (equivalent to `npx`).
// We should probably PR this up to ni
const parseNexec = ((agent, args) => {
  const map: Record<keyof typeof AGENTS, string> = {
    npm: 'npm exec {0}',
    yarn: 'yarn {0}',
    'yarn@berry': 'yarn {0}',
    pnpm: 'pnpm exec {0}',
    'pnpm@6': 'pnpm exec {0}',
    bun: 'bun run {0}',
  };

  const command = map[agent];
  return command.replace('{0}', args.map((c) => quote(c)).join(' ')).trim();
}) as Runner;

/**
 *
 * @param ctx The context set when executing the CLI.
 * @param flag The E2E testing tool used for the build.
 * @param buildCommandOptions Options to pass to the build command (such as --output-dir).
 *
 * @returns The command for building the E2E project.
 */
export async function getE2EBuildCommand(
  ctx: Context,
  flag: 'playwright' | 'cypress',
  buildCommandOptions: string[]
) {
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
      // eslint-disable-next-line unicorn/prefer-module
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

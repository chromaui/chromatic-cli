import { Context } from '../types';
import missingDependency from '../ui/messages/errors/missingDependency';
import { exitCodes, setExitCode } from './setExitCode';
import { failed } from '../ui/tasks/build';

export function getE2eBinPath(ctx: Context, flag: 'playwright' | 'cypress') {
  const dependencyName = `chromatic-${flag}`;
  try {
    return require.resolve(`${dependencyName}/bin/build-archive-storybook`);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      ctx.log.error(missingDependency({ dependencyName, flag }));
      setExitCode(ctx, exitCodes.MISSING_DEPENDENCY, true);
      throw new Error(failed(ctx).output);
    }
    throw err;
  }
}

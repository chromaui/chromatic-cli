import semver from 'semver';
import tmp from 'tmp-promise';

import { Context, Deps } from '../../types';

type SetSourceDirectoryDeps = Pick<Deps, 'options'>;

interface SetSourceDirectoryInput {
  // Preset by the build task's React Native skip path; when present we keep it as-is.
  sourceDir?: string;
  storybook?: Context['storybook'];
}

export const setSourceDirectory = async (
  deps: SetSourceDirectoryDeps,
  input: SetSourceDirectoryInput
): Promise<string> => {
  if (input.sourceDir) return input.sourceDir;

  if (deps.options.outputDir) return deps.options.outputDir;

  // Storybook v4 doesn't support absolute paths like tmp.dir would yield
  if (input.storybook?.version && semver.lt(input.storybook.version, '5.0.0')) {
    return 'storybook-static';
  }

  const temporaryDirectory = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-` });
  return temporaryDirectory.path;
};

import semver from 'semver';
import tmp from 'tmp-promise';

import { Context } from '../../types';

export const setSourceDirectory = async (ctx: Context) => {
  // do not overwrite if it is already set, for instance in
  // the skip condition of the build task on React Native
  if (ctx.sourceDir) return;

  if (ctx.options.outputDir) {
    ctx.sourceDir = ctx.options.outputDir;
  } else if (ctx.storybook && ctx.storybook.version && semver.lt(ctx.storybook.version, '5.0.0')) {
    // Storybook v4 doesn't support absolute paths like tmp.dir would yield
    ctx.sourceDir = 'storybook-static';
  } else {
    const temporaryDirectory = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-` });
    ctx.sourceDir = temporaryDirectory.path;
  }
};

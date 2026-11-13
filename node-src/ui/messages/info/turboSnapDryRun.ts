import chalk from 'chalk';
import pluralize from 'pluralize';
import { dedent } from 'ts-dedent';

import { Context } from '../../../types';
import { success } from '../../components/icons';
import { buildType, testType } from '../../tasks/utilities';

/**
 * Summarizes what TurboSnap found during `--dry-run`, which skips the steps that report it on a
 * real build. With TurboSnap 2.0 Chromatic decides after publishing, so there's no list to show.
 *
 * @param ctx The CLI context, narrowed to what the message reads.
 * @param ctx.options The CLI options, to name stories or tests.
 * @param ctx.onlyStoryFiles The story files TurboSnap 1.0 traced.
 * @param ctx.hashBased True when Chromatic applies TurboSnap 2.0 to the build.
 *
 * @returns The message to log.
 */
export default ({
  options,
  onlyStoryFiles = [],
  hashBased,
}: Pick<Context, 'options' | 'onlyStoryFiles'> & { hashBased?: boolean }) => {
  if (hashBased) {
    return dedent(chalk`
      ${success} {bold TurboSnap 2.0 enabled (dry run)}
      Chromatic decides which ${pluralize(testType({ options }))} to capture by comparing file hashes after your ${buildType({ options })} is published.
      Dry runs skip publishing, so there's nothing to compare yet and no affected ${pluralize(testType({ options }))} to list.
    `);
  }

  const files = pluralize(`${testType({ options })} file`, onlyStoryFiles.length, true);
  return dedent(chalk`
    ${success} {bold TurboSnap enabled (dry run)}
    Found ${files} affected by recent changes.
  `);
};

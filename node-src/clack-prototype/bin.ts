import 'dotenv/config';

import { readPackageUp } from 'read-package-up';
import { v4 as uuid } from 'uuid';

import type { InitialContext } from '..';
import { setupContext } from '../context';
import getEnvironment from '../lib/getEnvironment';
import getOptions, { getPartialOptions } from '../lib/getOptions';
import { createLogger } from '../lib/log';
import parseArguments from '../lib/parseArguments';
import { exitCodes, setExitCode } from '../lib/setExitCode';
import { Context } from '../types';
import { clackMain } from './main';

/**
 * Entrypoint for the Clack prototype. Does the regular context setup dance, then calls `clackMain`
 * to do the actual work.
 *
 * @param argv
 *
 * @returns
 */
async function run(argv: string[]): Promise<number> {
  const config = parseArguments(argv);
  const environment = getEnvironment();
  const log = createLogger(config.flags, undefined);
  const sessionId = uuid();

  const packageInfo = await readPackageUp({ cwd: process.cwd(), normalize: false });
  if (!packageInfo) {
    log.error('Could not find a package.json near the current working directory.');
    process.exit(253);
  }

  const initialContext: InitialContext = {
    ...config,
    packagePath: packageInfo.path,
    packageJson: packageInfo.packageJson,
    env: environment,
    log,
    sessionId,
  };

  const ctx = (await setupContext(initialContext)) as Context;
  ctx.options = getOptions(ctx, getPartialOptions(ctx));
  ctx.runtime = { forceRebuild: ctx.options.forceRebuild };
  ctx.log.setLogFile(ctx.options.logFile);

  setExitCode(ctx, exitCodes.OK);

  await clackMain(ctx);
  return ctx.exitCode ?? 0;
}

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

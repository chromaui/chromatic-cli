import { readFile } from 'jsonfile';
import pkgUp from 'pkg-up';
import { v4 as uuid } from 'uuid';
import 'any-observable/register/zen';

import getEnv from '../bin-src/lib/getEnv';
import { createLogger } from '../bin-src/lib/log';
import parseArgs from '../bin-src/lib/parseArgs';
import { runAll } from '../bin-src/main';
import { Context, Flags, Options } from '../bin-src/types';

interface Output {
  code: number;
  url: string;
  buildUrl: string;
  storybookUrl: string;
  specCount: number;
  componentCount: number;
  testCount: number;
  changeCount: number;
  errorCount: number;
  interactionTestFailuresCount: number;
  actualTestCount: number;
  actualCaptureCount: number;
  inheritedCaptureCount: number;
}

export async function runChromaticFull({
  flags = {},
  options = {},
}: {
  flags?: Flags;
  options?: Partial<Options>;
}): Promise<Output> {
  const sessionId = uuid();
  const env = getEnv();
  const log = createLogger(sessionId, env);
  const packagePath = await pkgUp(); // the user's own package.json
  const packageJson = await readFile(packagePath);

  const ctx: Partial<Context> = {
    ...parseArgs([]),
    packagePath,
    packageJson,
    env,
    log,
    sessionId,
    flags,
  };
  await runAll(ctx, options);

  return {
    // Keep this in sync with the configured outputs in action.yml
    code: ctx.exitCode,
    url: ctx.build?.webUrl,
    buildUrl: ctx.build?.webUrl,
    storybookUrl: ctx.build?.cachedUrl?.replace(/iframe\.html.*$/, ''),
    specCount: ctx.build?.specCount,
    componentCount: ctx.build?.componentCount,
    testCount: ctx.build?.testCount,
    changeCount: ctx.build?.changeCount,
    errorCount: ctx.build?.errorCount,
    interactionTestFailuresCount: ctx.build?.interactionTestFailuresCount,
    actualTestCount: ctx.build?.actualTestCount,
    actualCaptureCount: ctx.build?.actualCaptureCount,
    inheritedCaptureCount: ctx.build?.inheritedCaptureCount,
  };
}

export async function run(options: Partial<Options>): Promise<Output> {
  return runChromaticFull({ options });
}

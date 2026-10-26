import { Context } from '../types';

// Keep this in sync with the configured outputs in action.yml
export interface Output {
  code: number;
  url: string;
  buildUrl: string;
  storybookUrl: string;
  specCount: number;
  componentCount: number;
  testCount: number;
  // Includes ignored tests. `pendingCount` counts only the changes that still need review.
  changeCount: number;
  pendingCount: number;
  ignoredCount: number;
  errorCount: number;
  interactionTestFailuresCount: number;
  actualTestCount: number;
  actualCaptureCount: number;
  inheritedCaptureCount: number;
}

type RunBuild = NonNullable<Context['rebuildForBuild']>;

/**
 * Collect the results of a run. Each value comes from the new build, or from the build it rebuilt
 * when the new build does not have it.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns The details returned by the Node API and set as GitHub Action outputs.
 */
export default function getRunOutput(
  ctx: Partial<Pick<Context, 'exitCode' | 'build' | 'rebuildForBuild' | 'storybookUrl'>>
): Partial<Output> {
  const fromBuild = <K extends keyof RunBuild>(key: K) =>
    ctx.build?.[key] ?? ctx.rebuildForBuild?.[key];

  return {
    code: ctx.exitCode,
    url: fromBuild('webUrl'),
    buildUrl: fromBuild('webUrl'),
    storybookUrl: ctx.build?.storybookUrl || ctx.storybookUrl,
    specCount: fromBuild('specCount'),
    componentCount: fromBuild('componentCount'),
    testCount: fromBuild('testCount'),
    changeCount: fromBuild('changeCount'),
    pendingCount: fromBuild('pendingCount'),
    ignoredCount: fromBuild('ignoredCount'),
    errorCount: fromBuild('errorCount'),
    interactionTestFailuresCount: fromBuild('interactionTestFailuresCount'),
    actualTestCount: fromBuild('actualTestCount'),
    actualCaptureCount: fromBuild('actualCaptureCount'),
    inheritedCaptureCount: fromBuild('inheritedCaptureCount'),
  };
}

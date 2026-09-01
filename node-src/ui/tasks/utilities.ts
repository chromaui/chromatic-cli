import { isE2EBuild } from '../../lib/e2eUtils';
import { Context } from '../../types';

export const buildType = (ctx: Pick<Context, 'options'>) => {
  if (isE2EBuild(ctx.options)) return 'test suite';
  return 'Storybook';
};

/**
 * The name for a single unit of work in the build, for use in user-facing messages. E2E projects
 * (Playwright, Cypress, Vitest) have tests; Storybook projects have stories.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns 'test' for E2E builds, 'story' otherwise.
 */
export function testType(ctx: Pick<Context, 'options'>) {
  return isE2EBuild(ctx.options) ? 'test' : 'story';
}

/**
 * The name for what the build tests as a whole, for use in user-facing messages such as
 * "Test your ___". E2E projects test a suite; Storybook projects test stories.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns 'test suite' for E2E builds, 'stories' otherwise.
 */
export function suiteType(ctx: Pick<Context, 'options'>) {
  return isE2EBuild(ctx.options) ? 'test suite' : 'stories';
}

export const capitalize = (string: string) => string.charAt(0).toUpperCase() + string.slice(1);

import type { Build } from '../../git/mocks/mockIndex';

/**
 * Creates a Build object with default values.
 *
 * @param overrides - Optional overrides for the default values
 *
 * @returns A Build object
 */
export function createBuild(overrides: Partial<Build> = {}): Build {
  return {
    number: 1,
    commit: 'abc1234',
    branch: 'main',
    committedAt: 1_715_136_000, // 2024-05-01 00:00:00 UTC
    ...overrides,
  };
}

import { describe, expect, it } from 'vitest';

import { buildTests, erroredTests } from './__fixtures__/buildTests';
import { buildResults } from './buildResults';
import { error } from './icons';

const webUrl = 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42';
const setupUrl = 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57';

const results = (build: Parameters<typeof buildResults>[0] | object, isOnboarding = false) =>
  buildResults({ number: 42, webUrl, app: { setupUrl }, ...build } as any, isOnboarding, error);

const headline = (build: object) => results(build).split('\n')[0].replace(`${error} `, '');

describe('buildResults headline', () => {
  it.each([
    [{ errorCount: 1 }, '1 error'],
    [{ pendingCount: 1 }, '1 change needs review'],
    [{ deniedCount: 2, pendingCount: 3 }, '2 changes denied and 3 changes need review'],
    [
      { errorCount: 6, deniedCount: 3, pendingCount: 3 },
      '6 errors, 3 changes denied, and 3 changes need review',
    ],
  ])('counts %o as "%s"', (build, expected) => {
    expect(headline(build)).toBe(expected);
  });

  it('counts accepted changes only on an accepted build', () => {
    expect(headline({ status: 'ACCEPTED', acceptedCount: 2 })).toBe('2 changes accepted');
    expect(headline({ status: 'PENDING', acceptedCount: 2, pendingCount: 1 })).toBe(
      '1 change needs review'
    );
  });

  it('links to the build, or to setup while onboarding', () => {
    expect(results({ errorCount: 1 }).split('\n')[1]).toBe(`View Build 42: ${webUrl}`);
    expect(results({ errorCount: 1 }, true).split('\n')[1]).toBe(`Continue setup at ${setupUrl}`);
  });
});

describe('buildResults test lists', () => {
  it('splits errored tests into render and interaction failures', () => {
    const output = results({
      errorCount: 3,
      interactionTestFailuresCount: 1,
      erroredTests: [...erroredTests('Icon', 2), ...erroredTests('InputText', 1, true)],
    });

    expect(output).toContain('Failed to render:\n  Icon › Primary\n  Icon › Primary Dark\n\n');
    expect(output).toContain('Failed interaction tests:\n  InputText › Primary');
  });

  it('lists 50 tests and counts the rest from the build count, not the list', () => {
    const output = results({ pendingCount: 80, pendingTests: buildTests('Form', 60) });
    const listed = output.split('\n').filter((line) => line.includes(' › '));

    expect(listed).toHaveLength(50);
    expect(output).toMatch(/ {2}…and 30 more$/);
  });

  it('orders sections and leaves out empty ones', () => {
    const output = results({
      deniedCount: 1,
      deniedTests: buildTests('Button', 1),
      ignoredCount: 1,
      ignoredTests: buildTests('AnimatedGif', 1),
    });

    expect(output.match(/^\S.*:$/gm)).toEqual(['Denied:', 'Ignored:']);
  });
});

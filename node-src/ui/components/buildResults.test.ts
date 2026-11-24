import { describe, expect, it } from 'vitest';

import { buildTest, buildTests } from './__fixtures__/buildTests';
import { buildResults } from './buildResults';
import { error } from './icons';

const webUrl = 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42';
const setupUrl = 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57';

const results = (build: Parameters<typeof buildResults>[0] | object, isOnboarding = false) =>
  buildResults({ number: 42, webUrl, app: { setupUrl }, ...build } as any, isOnboarding, error);

const headline = (build: object) => results(build).split('\n')[0].replace(`${error} `, '');

describe('buildResults headline', () => {
  it.each([
    [{ errorCount: 1 }, '1 test failed'],
    [{ errorCount: 2, pendingCount: 3 }, '2 tests failed and 3 changes need review'],
    [{ pendingCount: 1 }, '1 change needs review'],
    [{ deniedCount: 2, pendingCount: 3 }, '2 changes denied and 3 changes need review'],
    [
      { errorCount: 6, deniedCount: 3, pendingCount: 3 },
      '6 tests failed, 3 changes denied, and 3 changes need review',
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
  // A full page of render failures must not hide the interaction failures or borrow their count.
  it('counts each error section from its own count', () => {
    const output = results({
      errorCount: 61,
      renderFailureCount: 60,
      renderFailureTests: buildTests('Icon', 50),
      interactionFailureCount: 1,
      interactionFailureTests: buildTests('InputText', 1),
    });

    expect(output).toContain('  …and 10 more\n\nFailed interaction tests:\n  InputText › Primary');
    expect(output).not.toMatch(/InputText › Primary\n {2}…and/);
  });

  it('counts the tests a section left out from its count, not the list', () => {
    const output = results({ pendingCount: 80, pendingTests: buildTests('Form', 50) });

    expect(output).toMatch(/ {2}…and 30 more$/);
  });

  it('names modes, including a named mode at the default viewport', () => {
    const output = results({
      pendingCount: 3,
      pendingTests: [
        buildTest('Form', 'Playground'),
        buildTest('Form', 'Playground', 'Dark'),
        {
          ...buildTest('Form', 'Playground', '320px'),
          parameters: { viewport: 320, viewportIsDefault: false },
        },
      ],
    });

    expect(output).toContain(
      'Need review:\n  Form › Playground\n  Form › Playground [Dark]\n  Form › Playground [320px]'
    );
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

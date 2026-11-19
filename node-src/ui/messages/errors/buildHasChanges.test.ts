import { describe, expect, it } from 'vitest';

import buildHasChanges from './buildHasChanges';

const webUrl = 'https://www.chromatic.com/build?appId=59c59bd0183bd100364e1d57&number=42';
const setupUrl = 'https://www.chromatic.com/setup?appId=59c59bd0183bd100364e1d57';

const message = (build: { status?: string; pendingCount?: number; deniedCount?: number }) =>
  buildHasChanges({
    build: { number: 42, status: 'PENDING', webUrl, app: { setupUrl }, ...build },
    exitCode: 1,
    isOnboarding: false,
  });

describe('buildHasChanges', () => {
  it('suggests --exit-zero-on-changes for unreviewed changes, never --auto-accept-changes', () => {
    const output = message({ pendingCount: 2 });

    expect(output).toContain('This command exits 1 while a build has unreviewed changes.');
    expect(output).toContain('--exit-zero-on-changes');
    expect(output).not.toContain('--auto-accept-changes');
  });

  it('suggests --exit-zero-on-changes when a denied build still has unreviewed changes', () => {
    expect(message({ status: 'DENIED', deniedCount: 1, pendingCount: 2 })).toContain(
      '--exit-zero-on-changes'
    );
  });

  it('suggests no CI flags for denied changes', () => {
    const output = message({ status: 'DENIED', deniedCount: 1 });

    expect(output).toContain('1 change denied');
    expect(output).not.toContain('--exit-zero-on-changes');
    expect(output).not.toContain('--auto-accept-changes');
  });
});

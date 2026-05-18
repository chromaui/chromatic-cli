import { afterEach, describe, expect, it, vi } from 'vitest';

import checkNodeVersion from './checkNodeVersion';
import TestLogger from './testLogger';

const stubNodeVersion = (version: string) => {
  vi.spyOn(process, 'versions', 'get').mockReturnValue({
    ...process.versions,
    node: version,
  });
};

describe('checkNodeVersion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a warning when the current Node version is below the supported range', () => {
    stubNodeVersion('20.20.1');
    const log = new TestLogger();

    checkNodeVersion(log, '>=22.0.0');

    expect(log.warnings.some((w) => w.includes('Unsupported Node.js version'))).toBe(true);
  });

  it('does not log when the current Node version satisfies the supported range', () => {
    stubNodeVersion('22.10.0');
    const log = new TestLogger();

    checkNodeVersion(log, '>=22.0.0');

    expect(log.warnings).toHaveLength(0);
  });

  it('does not log when no supported range is provided', () => {
    stubNodeVersion('20.20.1');
    const log = new TestLogger();

    checkNodeVersion(log, undefined);

    expect(log.warnings).toHaveLength(0);
  });
});

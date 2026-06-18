import { describe, expect, it } from 'vitest';

import { getE2EBuildCommand } from './e2e';
import { exitCodes } from './setExitCode';
import TestLogger from './testLogger';

describe('getE2EBuildCommand', () => {
  it('throws a TaskFailure with the MISSING_DEPENDENCY exit code when the E2E package is not installed', async () => {
    const deps = { options: { inAction: false } as any, log: new TestLogger() };

    await expect(
      getE2EBuildCommand(deps, 'playwright', ['--output-dir=./source-dir/'])
    ).rejects.toMatchObject({
      name: 'TaskFailure',
      exitCode: exitCodes.MISSING_DEPENDENCY,
      userError: true,
    });
  });
});

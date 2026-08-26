import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { getE2EBuildCommand } from './e2e';
import { exitCodes } from './setExitCode';
import TestLogger from './testLogger';
import { patchModulePath } from './testUtilities';

const PLAYWRIGHT_BUILD_ARCHIVE_BINARY = '@chromatic-com/playwright/bin/build-archive-storybook';

// Mock @antfu/ni to detect package manager as npm
vi.mock(import('@antfu/ni'), async (importOriginal) => ({
  ...(await importOriginal()),
  getCliCommand: async (runner, args, options) => runner('npm', args, options),
}));

describe('getE2EBuildCommand', () => {
  const deps = { options: { inAction: false } as any, log: new TestLogger() };

  it("can resolve E2E package when it's installed", async () => {
    const expectedBinary = '/path/to/playwright/bin/build-archive-storybook';
    const restore = patchModulePath(PLAYWRIGHT_BUILD_ARCHIVE_BINARY, expectedBinary);
    onTestFinished(restore);

    const command = await getE2EBuildCommand(deps, 'playwright', ['--output-dir=./source-dir/']);

    expect(command).toBe(`node ${expectedBinary} --output-dir=./source-dir/`);
  });

  it('throws original package resolving errors', async () => {
    const restore = patchModulePath(
      PLAYWRIGHT_BUILD_ARCHIVE_BINARY,
      'any',
      new Error('ERR_PACKAGE_PATH_NOT_EXPORTED')
    );
    onTestFinished(restore);

    await expect(
      getE2EBuildCommand(deps, 'playwright', ['--output-dir=./source-dir/'])
    ).rejects.toThrow('ERR_PACKAGE_PATH_NOT_EXPORTED');
  });

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

  describe('in action', () => {
    const deps = { options: { inAction: true } as any, log: new TestLogger() };

    it('invokes E2E package via package manager', async () => {
      const command = await getE2EBuildCommand(deps, 'playwright', ['--output-dir=./source-dir/']);

      expect(command).toBe('npm exec -- build-archive-storybook --output-dir=./source-dir/');
    });
  });
});

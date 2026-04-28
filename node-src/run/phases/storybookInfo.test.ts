import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import type { Options } from '../../types';
import { runStorybookInfoPhase } from './storybookInfo';

afterEach(() => {
  vi.clearAllMocks();
});

function makePorts(detected: any) {
  return {
    storybook: { detect: vi.fn(async () => detected) },
    fs: { exists: vi.fn(async () => true), readJson: vi.fn() },
    errors: { setTag: vi.fn(), setContext: vi.fn(), captureException: vi.fn(), flush: vi.fn() },
  } as any;
}

describe('runStorybookInfoPhase', () => {
  it('detects storybook info and sets the explicit baseDir from options', async () => {
    const ports = makePorts({ version: '7.0.0', addons: [] });
    const result = await runStorybookInfoPhase({
      options: { storybookBaseDir: '/custom/base' } as unknown as Options,
      git: { branch: 'main', commit: 'abc', committedAt: 0, fromCI: false },
      log: new TestLogger(),
      ports,
    });
    expect(result.baseDir).toBe('/custom/base');
    expect(result.version).toBe('7.0.0');
    expect(ports.errors.setTag).toHaveBeenCalledWith('storybookVersion', '7.0.0');
    expect(ports.errors.setContext).toHaveBeenCalledWith('storybook', expect.any(Object));
  });

  it('falls back to "." when no rootPath is available and no override', async () => {
    const ports = makePorts({ version: '7.0.0', addons: [] });
    const result = await runStorybookInfoPhase({
      options: {} as Options,
      git: { branch: 'main', commit: 'abc', committedAt: 0, fromCI: false },
      log: new TestLogger(),
      ports,
    });
    expect(result.baseDir).toBe('.');
  });

  it('does not setTag when no version is detected', async () => {
    const ports = makePorts({ addons: [] });
    await runStorybookInfoPhase({
      options: {} as Options,
      git: { branch: 'main', commit: 'abc', committedAt: 0, fromCI: false },
      log: new TestLogger(),
      ports,
    });
    expect(ports.errors.setTag).not.toHaveBeenCalled();
    expect(ports.errors.setContext).toHaveBeenCalled();
  });
});

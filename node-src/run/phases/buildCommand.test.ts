import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../../lib/testLogger';
import type { Options } from '../../types';
import { assembleBuildCommand, composeBuildArguments } from './buildCommand';

const log = new TestLogger();

function makeOptions(overrides: Partial<Options> = {}): Options {
  return overrides as unknown as Options;
}

describe('composeBuildArguments', () => {
  it('emits --output-dir when no user command is supplied', () => {
    expect(
      composeBuildArguments({
        storybook: { version: '7.0.0' },
        git: {},
        sourceDir: '/tmp/sb',
        hasUserCommand: false,
        log,
      })
    ).toEqual(['--output-dir=/tmp/sb']);
  });

  it('omits --output-dir when a user command is supplied', () => {
    expect(
      composeBuildArguments({
        storybook: { version: '7.0.0' },
        git: {},
        sourceDir: '/tmp/sb',
        hasUserCommand: true,
        log,
      })
    ).toEqual([]);
  });

  it('appends --webpack-stats-json when changedFiles set and storybook < 8.5.0', () => {
    expect(
      composeBuildArguments({
        storybook: { version: '8.0.0' },
        git: { changedFiles: ['a.ts'] },
        sourceDir: '/tmp/sb',
        hasUserCommand: false,
        log,
      })
    ).toEqual(['--output-dir=/tmp/sb', '--webpack-stats-json=/tmp/sb']);
  });

  it('appends --stats-json when changedFiles set and storybook >= 8.5.0', () => {
    expect(
      composeBuildArguments({
        storybook: { version: '8.5.0' },
        git: { changedFiles: ['a.ts'] },
        sourceDir: '/tmp/sb',
        hasUserCommand: false,
        log,
      })
    ).toEqual(['--output-dir=/tmp/sb', '--stats-json=/tmp/sb']);
  });

  it('warns when --only-changed is requested for unsupported storybook', () => {
    const localLog = new TestLogger();
    expect(
      composeBuildArguments({
        storybook: { version: '6.1.0' },
        git: { changedFiles: ['a.ts'] },
        sourceDir: '/tmp/sb',
        hasUserCommand: false,
        log: localLog,
      })
    ).toEqual(['--output-dir=/tmp/sb']);
    expect(localLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('Storybook version 6.2.0 or later is required')
    );
  });

  it('treats unknown storybook version as supported and uses webpack-stats-json', () => {
    expect(
      composeBuildArguments({
        storybook: undefined,
        git: { changedFiles: ['a.ts'] },
        sourceDir: '/tmp/sb',
        hasUserCommand: false,
        log,
      })
    ).toEqual(['--output-dir=/tmp/sb', '--webpack-stats-json=/tmp/sb']);
  });
});

function makeResolvers() {
  return {
    runScript: vi.fn(async (args: string[]) => `npm run ${args.join(' ')}`),
    runE2EBin: vi.fn(async (framework: string, args: string[]) =>
      ['node', `bin/${framework}`, ...args].join(' ')
    ),
  };
}

describe('assembleBuildCommand', () => {
  it('returns undefined for React Native apps', async () => {
    const resolvers = makeResolvers();
    const result = await assembleBuildCommand({
      options: makeOptions(),
      sourceDir: '/tmp/sb',
      git: {},
      isReactNativeApp: true,
      log,
      resolvers,
    });
    expect(result).toBeUndefined();
    expect(resolvers.runScript).not.toHaveBeenCalled();
    expect(resolvers.runE2EBin).not.toHaveBeenCalled();
  });

  it('uses user-supplied buildCommand verbatim with appended args', async () => {
    const resolvers = makeResolvers();
    const result = await assembleBuildCommand({
      options: makeOptions({ buildCommand: 'nx build storybook' }),
      sourceDir: '/tmp/sb',
      storybook: { version: '7.0.0' },
      git: { changedFiles: ['a.ts'] },
      log,
      resolvers,
    });
    expect(result).toBe('nx build storybook --webpack-stats-json=/tmp/sb');
    expect(resolvers.runScript).not.toHaveBeenCalled();
  });

  it('routes through runE2EBin for E2E builds', async () => {
    const resolvers = makeResolvers();
    const result = await assembleBuildCommand({
      options: makeOptions({ playwright: true }),
      sourceDir: '/tmp/sb',
      storybook: { version: '7.0.0' },
      git: {},
      log,
      resolvers,
    });
    expect(resolvers.runE2EBin).toHaveBeenCalledWith('playwright', ['--output-dir=/tmp/sb']);
    expect(result).toBe('node bin/playwright --output-dir=/tmp/sb');
  });

  it('routes through runScript for npm-style builds with buildScriptName', async () => {
    const resolvers = makeResolvers();
    const result = await assembleBuildCommand({
      options: makeOptions({ buildScriptName: 'build:storybook' }),
      sourceDir: '/tmp/sb',
      storybook: { version: '7.0.0' },
      git: {},
      log,
      resolvers,
    });
    expect(resolvers.runScript).toHaveBeenCalledWith(['build:storybook', '--output-dir=/tmp/sb']);
    expect(result).toBe('npm run build:storybook --output-dir=/tmp/sb');
  });

  it('throws when no user command, no E2E flag, and no buildScriptName', async () => {
    await expect(
      assembleBuildCommand({
        options: makeOptions(),
        sourceDir: '/tmp/sb',
        git: {},
        log,
        resolvers: makeResolvers(),
      })
    ).rejects.toThrow(/Unable to determine build script/);
  });
});

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveStorybookVersion } from './storybookVersion';

vi.mock('module', () => ({
  createRequire: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

const mockCreateRequire = vi.mocked(
  createRequire as (filename: string) => { resolve: (request: string) => string }
);
const mockReadFileSync = vi.mocked(readFileSync as (path: string) => string);
const mockResolve = vi.fn();

const projectRoot = '/repo/packages/ui';

// Resolution is keyed by request so a test can make one package resolvable and another not, which is
// how the Storybook 8 fallback and the hoisted-install case are told apart.
function givenResolvable(paths: Record<string, string>) {
  mockResolve.mockImplementation((request: string) => {
    const resolved = paths[request];
    if (!resolved) throw new Error(`Cannot find module '${request}'`);
    return resolved;
  });
}

beforeEach(() => {
  mockCreateRequire.mockReturnValue({ resolve: mockResolve });
});

describe('resolveStorybookVersion', () => {
  it('reads the version from the `storybook` package on Storybook 9 and later', () => {
    givenResolvable({ 'storybook/package.json': '/repo/node_modules/storybook/package.json' });
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '9.1.20' }));

    expect(resolveStorybookVersion(projectRoot)).toBe('9.1.20');
    expect(mockReadFileSync).toHaveBeenCalledWith(
      '/repo/node_modules/storybook/package.json',
      'utf8'
    );
  });

  it('falls back to `@storybook/core` on Storybook 8, where `storybook` is the CLI', () => {
    givenResolvable({
      '@storybook/core/package.json': '/repo/node_modules/@storybook/core/package.json',
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '8.6.18' }));

    expect(resolveStorybookVersion(projectRoot)).toBe('8.6.18');
  });

  it('resolves from the project root so a workspace-hoisted install is found', () => {
    givenResolvable({ 'storybook/package.json': '/repo/node_modules/storybook/package.json' });
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '10.6.0-alpha.3' }));

    expect(resolveStorybookVersion(projectRoot)).toBe('10.6.0-alpha.3');
    // The resolver walks up from the project root, which is what finds a package hoisted to the
    // repository root rather than installed beside the Storybook project.
    expect(mockCreateRequire).toHaveBeenCalledWith('/repo/packages/ui/package.json');
  });

  it('skips a resolvable package that has no version and continues to the next', () => {
    givenResolvable({
      'storybook/package.json': '/repo/node_modules/storybook/package.json',
      '@storybook/core/package.json': '/repo/node_modules/@storybook/core/package.json',
    });
    mockReadFileSync.mockImplementation((path: string) =>
      path.includes('@storybook/core')
        ? JSON.stringify({ version: '8.6.18' })
        : JSON.stringify({ name: 'storybook' })
    );

    expect(resolveStorybookVersion(projectRoot)).toBe('8.6.18');
  });

  it('throws when no Storybook package can be resolved, so the caller falls back to v1', () => {
    givenResolvable({});

    let err: Error | undefined;
    try {
      resolveStorybookVersion(projectRoot);
    } catch (error) {
      err = error as Error;
    }

    expect(err?.message).toContain('Could not resolve a Storybook version');
    expect(err?.message).toContain(projectRoot);
  });
});

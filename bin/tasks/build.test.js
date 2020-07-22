import execa from 'execa';

import { buildStorybook, setSourceDir, setSpawnParams } from './build';

jest.mock('execa');

describe('setSourceDir', () => {
  it('sets a random temp directory path on the context', async () => {
    const ctx = { options: {}, storybook: { version: '5.0.0' } };
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toMatch(/chromatic-/);
  });

  it('falls back to the default output dir for older Storybooks', async () => {
    const ctx = { options: {}, storybook: { version: '4.0.0' } };
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toBe('storybook-static');
  });

  it('uses the outputDir option if provided', async () => {
    const ctx = { options: { outputDir: 'storybook-out' }, storybook: { version: '5.0.0' } };
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });

  it('uses the outputDir option if provided, even for older Storybooks', async () => {
    const ctx = { options: { outputDir: 'storybook-out' }, storybook: { version: '4.0.0' } };
    await setSourceDir(ctx);
    expect(ctx.sourceDir).toBe('storybook-out');
  });
});

describe('setSpawnParams', () => {
  it('sets the spawn params on the context', async () => {
    process.env.npm_execpath = 'npm';
    const ctx = { sourceDir: './source-dir/', options: { buildScriptName: 'build:storybook' } };
    await setSpawnParams(ctx);
    expect(ctx.spawnParams).toEqual({
      command: 'npm',
      clientArgs: ['run', '--silent'],
      scriptArgs: ['build:storybook', '--', '--output-dir', './source-dir/'],
    });
  });
});

describe('buildStorybook', () => {
  it('runs the build command', async () => {
    const ctx = {
      spawnParams: {
        command: 'build:storybook',
        clientArgs: ['--client-args'],
        scriptArgs: ['--script-args'],
      },
    };
    await buildStorybook(ctx);
    expect(ctx.buildLogFile).toMatch(/build-storybook\.log$/);
    expect(execa).toHaveBeenCalledWith(
      'build:storybook',
      ['--client-args', '--script-args'],
      expect.objectContaining({ stdio: expect.any(Array) })
    );
  });
});

import chalk from 'chalk';
import { Context } from '../types';

import getEnv from './getEnv';
import getOptions from './getOptions';
import getStorybookConfiguration from './getStorybookConfiguration';
import parseArgs from './parseArgs';
import TestLogger from './testLogger';

// Make sure we don't print any colors so we can match against plain strings
chalk.level = 0;

jest.mock('./getEnv', () => () => ({
  CHROMATIC_PROJECT_TOKEN: 'env-code',
}));

const getContext = (argv: string[]): Context => {
  const env = getEnv();
  const log = new TestLogger();
  const packageJson = {
    scripts: {
      storybook: 'start-storybook',
      otherStorybook: 'start-storybook',
      notStorybook: 'lint',
      'build-storybook': 'build-storybook',
      otherBuildStorybook: 'build-storybook',
    },
  };
  return { env, log, packageJson, ...parseArgs(argv) } as any;
};

describe('getOptions', () => {
  it('sets reasonable defaults', async () => {
    expect(getOptions(getContext(['--project-token', 'cli-code']))).toMatchObject({
      projectToken: 'cli-code',
      buildScriptName: 'build-storybook',
      fromCI: !!process.env.CI,
      autoAcceptChanges: undefined,
      exitZeroOnChanges: undefined,
      exitOnceUploaded: undefined,
      interactive: false,
      verbose: false,
      originalArgv: ['--project-token', 'cli-code'],
    });
  });

  it('picks up project-token from environment', async () => {
    expect(getOptions(getContext([]))).toMatchObject({
      projectToken: 'env-code',
    });
  });

  it('allows you to override defaults for boolean options', async () => {
    expect(
      getOptions(
        getContext([
          '--ci',
          '--auto-accept-changes',
          '--exit-zero-on-changes',
          '--exit-once-uploaded',
          '--skip',
          '--debug',
          '--no-interactive',
        ])
      )
    ).toMatchObject({
      skip: true,
      fromCI: true,
      autoAcceptChanges: true,
      exitZeroOnChanges: true,
      exitOnceUploaded: true,
      verbose: true,
      interactive: false,
    });
  });

  it('picks up default start script', async () => {
    expect(getOptions(getContext(['-s']))).toMatchObject({
      scriptName: 'storybook',
      url: 'http://localhost',
    });
  });

  it('allows you to specify alternate build script', async () => {
    expect(getOptions(getContext(['--build-script-name', 'otherBuildStorybook']))).toMatchObject({
      buildScriptName: 'otherBuildStorybook',
    });
  });

  it('allows you to specify alternate script, still picks up port', async () => {
    expect(getOptions(getContext(['--script-name', 'otherStorybook']))).toMatchObject({
      scriptName: 'otherStorybook',
      url: 'http://localhost',
    });
  });

  it('throws if you try to pass a script name and a url', async () => {
    await expect(() =>
      getOptions(getContext(['--script-name', 'storybook', '--storybook-url', 'http://foo.bar']))
    ).toThrow(/You can only use one of --script-name, --storybook-url/);
  });

  it('throws if you try to pass a script name and a build script', async () => {
    await expect(() =>
      getOptions(getContext(['--script-name', 'storybook', '-b', 'build-command']))
    ).toThrow(/You can only use one of --build-script-name, --script-name/);
  });

  it('throws if you try to pass a script name and a directory', async () => {
    await expect(() =>
      getOptions(getContext(['--script-name', 'storybook', '--storybook-build-dir', '/tmp/dir']))
    ).toThrow(/You can only use one of --script-name, --storybook-build-dir/);
  });

  it('throws if you try to pass a build script and a directory', async () => {
    await expect(() =>
      getOptions(getContext(['-b', '/tmp/dir', '--storybook-build-dir', '/tmp/dir']))
    ).toThrow(/You can only use one of --build-script-name, --storybook-build-dir/);
  });

  it('allows you to set a URL without path', async () => {
    expect(getOptions(getContext(['--storybook-url', 'https://google.com']))).toMatchObject({
      url: 'https://google.com',
    });
  });

  it('allows you to set a URL with a path', async () => {
    expect(getOptions(getContext(['--storybook-url', 'https://google.com/foo']))).toMatchObject({
      url: 'https://google.com/foo',
    });
  });

  it('allows you to set a URL with iframe.html already set', async () => {
    expect(
      getOptions(getContext(['--storybook-url', 'https://google.com/iframe.html?param=foo']))
    ).toMatchObject({
      url: 'https://google.com/iframe.html?param=foo',
    });
  });

  it('allows you to specify the branch name', async () => {
    expect(getOptions(getContext(['--branch-name', 'my/branch']))).toMatchObject({
      branchName: 'my/branch',
    });
  });

  it('supports arrays, removing empty values', async () => {
    const flags = ['--only-changed', '--externals', 'foo', '--externals', '', '--externals', 'bar'];
    expect(getOptions(getContext(flags))).toMatchObject({ externals: ['foo', 'bar'] });
  });
});

describe('getStorybookConfiguration', () => {
  it('handles short names', async () => {
    const port = getStorybookConfiguration('start-storybook -p 9001', '-p', '--port');
    expect(port).toBe('9001');
  });
  it('handles long names', async () => {
    const port = getStorybookConfiguration('start-storybook --port 9001', '-p', '--port');
    expect(port).toBe('9001');
  });
  it('handles equals', async () => {
    const port = getStorybookConfiguration('start-storybook --port=9001', '-p', '--port');
    expect(port).toBe('9001');
  });
  it('handles double space', async () => {
    const port = getStorybookConfiguration('start-storybook --port  9001', '-p', '--port');
    expect(port).toBe('9001');
  });

  it('handles complex scripts', async () => {
    const port = getStorybookConfiguration(
      "node verify-node-version.js && concurrently --raw --kill-others 'yarn relay --watch' 'start-storybook -s ./public -p 9001'",
      '-p',
      '--port'
    );
    expect(port).toBe('9001');
  });
});

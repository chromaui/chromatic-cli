import chalk from 'chalk';
import { describe, expect, it, vi } from 'vitest';

import { Context } from '../types';
import getEnvironment from './getEnvironment';
import getOptions from './getOptions';
import parseArguments from './parseArguments';
import TestLogger from './testLogger';

// Make sure we don't print any colors so we can match against plain strings
chalk.level = 0;

vi.mock('./getEnvironment', () => ({
  default: () => ({ CHROMATIC_PROJECT_TOKEN: 'env-code' }),
}));

const getContext = (argv: string[]): Context => {
  const environment = getEnvironment();
  const log = new TestLogger();
  const packageJson = {
    scripts: {
      storybook: 'start-storybook',
      notStorybook: 'lint',
      'build-storybook': 'build-storybook',
      otherBuildStorybook: 'build-storybook',
    },
  };
  return { env: environment, log, packageJson, ...parseArguments(argv) } as any;
};

describe('getOptions', () => {
  it('sets reasonable defaults', async () => {
    expect(getOptions(getContext(['--project-token', 'cli-code']))).toMatchObject({
      projectToken: 'cli-code',
      fromCI: !!process.env.CI,
      dryRun: false,
      debug: false,
      autoAcceptChanges: false,
      exitZeroOnChanges: false,
      exitOnceUploaded: false,
      diagnosticsFile: undefined,
      interactive: false,
      isLocalBuild: false,
      originalArgv: ['--project-token', 'cli-code'],

      onlyChanged: undefined,
      onlyStoryFiles: undefined,
      onlyStoryNames: undefined,
      untraced: undefined,
      externals: undefined,
      traceChanged: undefined,
      list: undefined,
      logFile: undefined,
      skip: undefined,
      forceRebuild: undefined,
      junitReport: undefined,
      zip: undefined,

      ignoreLastBuildOnBranch: undefined,
      preserveMissingSpecs: undefined,

      buildScriptName: 'build-storybook',
      outputDir: undefined,
      allowConsoleErrors: undefined,
      storybookBuildDir: undefined,
      storybookBaseDir: undefined,
      storybookConfigDir: undefined,
      storybookLogFile: 'build-storybook.log',

      ownerName: undefined,
      repositorySlug: undefined,
      branchName: '',
      patchHeadRef: undefined,
      patchBaseRef: undefined,
      uploadMetadata: undefined,
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
          '--no-storybook-log-file',
        ])
      )
    ).toMatchObject({
      skip: true,
      fromCI: true,
      autoAcceptChanges: true,
      exitZeroOnChanges: true,
      exitOnceUploaded: true,
      debug: true,
      interactive: false,
      storybookLogFile: false,
    });
  });

  it('allows you to specify alternate build script', async () => {
    expect(getOptions(getContext(['--build-script-name', 'otherBuildStorybook']))).toMatchObject({
      buildScriptName: 'otherBuildStorybook',
    });
  });

  it('allows you to pass both a build script and a directory', async () => {
    expect(() =>
      getOptions(getContext(['-b', 'build:storybook', '--storybook-build-dir', '/tmp/dir']))
    ).not.toThrow();
  });

  it('allows you to specify the branch name', async () => {
    expect(getOptions(getContext(['--branch-name', 'my/branch']))).toMatchObject({
      branchName: 'my/branch',
    });
    expect(getOptions(getContext(['--branch-name', 'owner:my/branch']))).toMatchObject({
      branchName: 'my/branch',
      ownerName: 'owner',
    });
  });

  it('allows you to specify the repository slug', async () => {
    expect(getOptions(getContext(['--repository-slug', 'owner/repo']))).toMatchObject({
      ownerName: 'owner',
      repositorySlug: 'owner/repo',
    });
  });

  it('checks whether branch name and repository slug contain a conflicting owner name', async () => {
    expect(
      getOptions(
        getContext(['--branch-name', 'owner:my/branch', '--repository-slug', 'owner/repo'])
      )
    ).toMatchObject({
      branchName: 'my/branch',
      ownerName: 'owner',
      repositorySlug: 'owner/repo',
    });
    expect(() =>
      getOptions(
        getContext(['--branch-name', 'owner:my/branch', '--repository-slug', 'another/repo'])
      )
    ).toThrow('Invalid value for --branch-name and/or --repository-slug');
  });

  it('supports arrays, removing empty values', async () => {
    const flags = ['--only-changed', '--externals', 'foo', '--externals', '', '--externals', 'bar'];
    expect(getOptions(getContext(flags))).toMatchObject({ externals: ['foo', 'bar'] });
  });

  it('allows you to set options with configuration', async () => {
    expect(
      getOptions({ ...getContext([]), configuration: { projectToken: 'config-token' } })
    ).toMatchObject({
      projectToken: 'config-token',
    });
  });

  it('allows you to override configuration with flags', async () => {
    expect(
      getOptions({
        ...getContext(['--project-token', 'cli-token']),
        configuration: { projectToken: 'config-token' },
      })
    ).toMatchObject({
      projectToken: 'cli-token',
    });
  });

  it('allows you to set options with extraOptions', async () => {
    expect(
      getOptions({ ...getContext([]), extraOptions: { projectToken: 'extra-token' } })
    ).toMatchObject({
      projectToken: 'extra-token',
    });
  });

  it('allows you to override flags with extraOptions', async () => {
    expect(
      getOptions({
        ...getContext(['--project-token', 'cli-token']),
        extraOptions: { projectToken: 'extra-token' },
      })
    ).toMatchObject({
      projectToken: 'extra-token',
    });
  });

  it('implicitly enables diagnostics and log file when using debug or uploadMetadata', async () => {
    expect(getOptions(getContext(['--debug']))).toMatchObject({
      diagnosticsFile: 'chromatic-diagnostics.json',
      logFile: 'chromatic.log',
      debug: true,
    });
    expect(getOptions(getContext(['--upload-metadata']))).toMatchObject({
      diagnosticsFile: 'chromatic-diagnostics.json',
      logFile: 'chromatic.log',
      uploadMetadata: true,
    });
  });

  it('allows you to specify a diagnostics file name', async () => {
    expect(getOptions(getContext(['--diagnostics-file', 'output.json']))).toMatchObject({
      diagnosticsFile: 'output.json',
    });
  });
});

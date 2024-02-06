import { readFileSync } from 'fs';
import { beforeEach, expect, it, vi } from 'vitest';

import { getConfiguration } from './getConfiguration';

vi.mock('fs');
const mockedReadFile = vi.mocked(readFileSync);

beforeEach(() => {
  mockedReadFile.mockReset();
});

it('reads configuration successfully', async () => {
  mockedReadFile.mockReturnValue(
    JSON.stringify({
      projectId: 'project-id',
      projectToken: 'project-token',

      onlyChanged: 'only-changed',
      onlyStoryFiles: ['only-story-files'],
      onlyStoryNames: ['only-story-names'],
      untraced: ['untraced'],
      externals: ['externals'],
      debug: true,
      diagnosticsFile: 'diagnostics-file',
      fileHashing: true,
      junitReport: 'junit-report',
      zip: true,
      autoAcceptChanges: 'auto-accept-changes',
      exitZeroOnChanges: 'exit-zero-on-changes',
      exitOnceUploaded: 'exit-once-uploaded',
      ignoreLastBuildOnBranch: 'ignore-last-build-on-branch',

      buildScriptName: 'build-script-name',
      outputDir: 'output-dir',
      skip: 'skip',

      storybookBuildDir: 'storybook-build-dir',
      storybookBaseDir: 'storybook-base-dir',
      storybookConfigDir: 'storybook-config-dir',
      storybookLogFile: 'storybook-log-file',
      logFile: 'log-file',
      uploadMetadata: true,
    })
  );

  expect(await getConfiguration()).toEqual({
    projectId: 'project-id',
    projectToken: 'project-token',

    onlyChanged: 'only-changed',
    onlyStoryFiles: ['only-story-files'],
    onlyStoryNames: ['only-story-names'],
    untraced: ['untraced'],
    externals: ['externals'],
    debug: true,
    diagnosticsFile: 'diagnostics-file',
    fileHashing: true,
    junitReport: 'junit-report',
    zip: true,
    autoAcceptChanges: 'auto-accept-changes',
    exitZeroOnChanges: 'exit-zero-on-changes',
    exitOnceUploaded: 'exit-once-uploaded',
    ignoreLastBuildOnBranch: 'ignore-last-build-on-branch',

    buildScriptName: 'build-script-name',
    outputDir: 'output-dir',
    skip: 'skip',

    storybookBuildDir: 'storybook-build-dir',
    storybookBaseDir: 'storybook-base-dir',
    storybookConfigDir: 'storybook-config-dir',
    storybookLogFile: 'storybook-log-file',
    logFile: 'log-file',
    uploadMetadata: true,
  });
});

it('handles other side of union options', async () => {
  mockedReadFile.mockReturnValue(
    JSON.stringify({
      onlyChanged: true,
      diagnosticsFile: true,
      junitReport: true,
      autoAcceptChanges: true,
      exitZeroOnChanges: true,
      exitOnceUploaded: true,
      skip: true,
      storybookLogFile: true,
      logFile: true,
    })
  );

  expect(await getConfiguration()).toEqual({
    onlyChanged: true,
    diagnosticsFile: true,
    junitReport: true,
    autoAcceptChanges: true,
    exitZeroOnChanges: true,
    exitOnceUploaded: true,
    skip: true,
    storybookLogFile: true,
    logFile: true,
  });
});

it('reads from chromatic.config.json by default', async () => {
  mockedReadFile.mockReturnValue(JSON.stringify({ projectToken: 'json-file-token' })).mockClear();
  await getConfiguration();

  expect(mockedReadFile).toHaveBeenCalledWith('chromatic.config.json', 'utf8');
});

it('can read from a different location', async () => {
  mockedReadFile.mockReturnValue(JSON.stringify({ projectToken: 'json-file-token' })).mockClear();
  await getConfiguration('test.file');

  expect(mockedReadFile).toHaveBeenCalledWith('test.file', 'utf8');
});

it('returns nothing if there is no config file and it was not specified', async () => {
  mockedReadFile.mockImplementation(() => {
    throw new Error('ENOENT');
  });

  expect(await getConfiguration()).toEqual({});
});

it('returns nothing if there is no config file and it was specified', async () => {
  mockedReadFile.mockImplementation(() => {
    throw new Error('ENOENT');
  });

  await expect(getConfiguration('test.file')).rejects.toThrow(/could not be found/);
});

it('errors if config file contains invalid data', async () => {
  mockedReadFile.mockReturnValue(JSON.stringify({ projectToken: 1 }));

  await expect(getConfiguration('test.file')).rejects.toThrow(/projectToken/);
});

it('errors if config file contains unknown keys', async () => {
  mockedReadFile.mockReturnValue(JSON.stringify({ random: 1 }));

  await expect(getConfiguration('test.file')).rejects.toThrow(/random/);
});

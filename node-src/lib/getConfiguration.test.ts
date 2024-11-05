import { existsSync, PathLike, readFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getConfiguration } from './getConfiguration';

vi.mock('fs');
const mockedReadFile = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  mockedReadFile.mockReset();
  mockedExistsSync.mockReset();
});

it('reads basic JSON configuration successfully', async () => {
  mockedReadFile.mockReturnValue(
    JSON.stringify({
      $schema: 'https://www.chromatic.com/config-file.schema.json',
      projectId: 'project-id',
      projectToken: 'project-token',

      onlyChanged: 'only-changed',
      traceChanged: 'expanded',
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
      skipUpdateCheck: false,

      storybookBuildDir: 'storybook-build-dir',
      storybookBaseDir: 'storybook-base-dir',
      storybookConfigDir: 'storybook-config-dir',
      storybookLogFile: 'storybook-log-file',
      logFile: 'log-file',
      uploadMetadata: true,
    })
  );

  expect(await getConfiguration()).toEqual({
    $schema: 'https://www.chromatic.com/config-file.schema.json',
    configFile: 'chromatic.config.json',
    projectId: 'project-id',
    projectToken: 'project-token',

    onlyChanged: 'only-changed',
    traceChanged: 'expanded',
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
    skipUpdateCheck: false,

    storybookBuildDir: 'storybook-build-dir',
    storybookBaseDir: 'storybook-base-dir',
    storybookConfigDir: 'storybook-config-dir',
    storybookLogFile: 'storybook-log-file',
    logFile: 'log-file',
    uploadMetadata: true,
  });
});

it('reads JSON5 configuration successfully', async () => {
  mockedReadFile.mockReturnValue(`
    {
      "$schema": "https://www.chromatic.com/config-file.schema.json",
      "projectId": "project-id",
      "projectToken": "project-token",
      "onlyChanged": "only-changed",
      "traceChanged": "expanded",
      "onlyStoryFiles": [
          "only-story-files"
      ],
      "onlyStoryNames": [
          "only-story-names"
      ],
      "untraced": [
          "untraced"
      ],
      "externals": [
          "externals"
      ],
      // This is a comment in a json file
      "debug": true,
      "diagnosticsFile": "diagnostics-file",
      "fileHashing": true,
      "junitReport": "junit-report",
      "zip": true,
      "autoAcceptChanges": "auto-accept-changes",
      "exitZeroOnChanges": "exit-zero-on-changes",
      "exitOnceUploaded": "exit-once-uploaded",
      "ignoreLastBuildOnBranch": "ignore-last-build-on-branch",
      "buildScriptName": "build-script-name",
      "outputDir": "output-dir",
      "skip": "skip",
      "skipUpdateCheck": false,
      "storybookBuildDir": "storybook-build-dir",
      "storybookBaseDir": "storybook-base-dir",
      "storybookConfigDir": "storybook-config-dir",
      "storybookLogFile": "storybook-log-file",
      "logFile": "log-file",
      "uploadMetadata": true
    }
  `);

  expect(await getConfiguration()).toEqual({
    $schema: 'https://www.chromatic.com/config-file.schema.json',
    configFile: 'chromatic.config.json',
    projectId: 'project-id',
    projectToken: 'project-token',

    onlyChanged: 'only-changed',
    traceChanged: 'expanded',
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
    skipUpdateCheck: false,

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
      traceChanged: true,
      diagnosticsFile: true,
      junitReport: true,
      autoAcceptChanges: true,
      exitZeroOnChanges: true,
      exitOnceUploaded: true,
      skip: true,
      skipUpdateCheck: false,
      storybookLogFile: true,
      logFile: true,
    })
  );

  expect(await getConfiguration()).toEqual({
    configFile: 'chromatic.config.json',
    onlyChanged: true,
    traceChanged: true,
    diagnosticsFile: true,
    junitReport: true,
    autoAcceptChanges: true,
    exitZeroOnChanges: true,
    exitOnceUploaded: true,
    skip: true,
    skipUpdateCheck: false,
    storybookLogFile: true,
    logFile: true,
  });
});

describe('resolveConfigFileName', () => {
  describe('when no other config files exist', () => {
    beforeEach(() => {
      mockedExistsSync.mockImplementation((_path: PathLike) => {
        return false;
      });
    });

    afterEach(() => {
      mockedExistsSync.mockReset();
    });

    it('reads from chromatic.config.json by default', async () => {
      mockedReadFile
        .mockReturnValue(JSON.stringify({ projectToken: 'json-file-token' }))
        .mockClear();

      await getConfiguration();

      expect(mockedReadFile).toHaveBeenCalledWith('chromatic.config.json', 'utf8');
    });
  });

  describe('if the chromatic.config.jsonc file exists', () => {
    beforeEach(() => {
      mockedExistsSync.mockImplementation((path: PathLike) => {
        if (path === 'chromatic.config.jsonc') {
          return true;
        }

        return false;
      });
    });

    afterEach(() => {
      mockedExistsSync.mockReset();
    });

    it('reads chromatic.config.json', async () => {
      mockedReadFile
        .mockReturnValue(JSON.stringify({ projectToken: 'json-file-token' }))
        .mockClear();

      await getConfiguration();

      expect(mockedReadFile).toHaveBeenCalledWith('chromatic.config.jsonc', 'utf8');

      mockedExistsSync.mockClear();
    });
  });

  describe('if the chromatic.config.json5 file exists', () => {
    beforeEach(() => {
      mockedExistsSync.mockImplementation((path: PathLike) => {
        if (path === 'chromatic.config.json5') {
          return true;
        }

        return false;
      });
    });

    afterEach(() => {
      mockedExistsSync.mockReset();
    });

    it('reads chromatic.config.json5 if it exists', async () => {
      mockedReadFile
        .mockReturnValue(JSON.stringify({ projectToken: 'json-file-token' }))
        .mockClear();

      await getConfiguration();

      expect(mockedReadFile).toHaveBeenCalledWith('chromatic.config.json5', 'utf8');

      mockedExistsSync.mockClear();
    });
  });

  describe('when a config file is specified and exists on the file system', () => {
    beforeEach(() => {
      mockedExistsSync.mockImplementation((path: PathLike) => {
        if (path === 'test.file') {
          return true;
        }

        return false;
      });
    });

    afterEach(() => {
      mockedExistsSync.mockReset();
    });

    it('can read from that config file', async () => {
      mockedReadFile
        .mockReturnValue(JSON.stringify({ projectToken: 'json-file-token' }))
        .mockClear();
      await getConfiguration('test.file');

      expect(mockedReadFile).toHaveBeenCalledWith('test.file', 'utf8');
    });
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

  it('errors if config file is unparseable', async () => {
    {
      mockedReadFile.mockReturnValue('invalid json');
      await expect(getConfiguration('test.file')).rejects.toThrow(
        /Configuration file .+ could not be parsed/
      );
    }
    {
      mockedReadFile.mockReturnValue('{ "foo": 1 "unexpectedString": 2 }');
      await expect(getConfiguration('test.file')).rejects.toThrow(
        /Configuration file .+ could not be parsed/
      );
    }
    {
      mockedReadFile.mockReturnValue('{ "unexpectedEnd": ');
      await expect(getConfiguration('test.file')).rejects.toThrow(
        /Configuration file .+ could not be parsed/
      );
    }
  });
});

import { existsSync, PathLike, readFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getConfiguration } from './getConfiguration';

vi.mock('fs');
const mockedReadFile = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  mockedReadFile.mockReset();
  mockedExistsSync.mockReset();
  // Most tests exercise parsing of an existing default config file
  mockedExistsSync.mockReturnValue(true);
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
  describe('when only chromatic.config.json exists', () => {
    beforeEach(() => {
      mockedExistsSync.mockImplementation((path: PathLike) => {
        if (path === 'chromatic.config.json') {
          return true;
        }

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

  describe('when a config file is specified and a default also exists', () => {
    beforeEach(() => {
      mockedExistsSync.mockImplementation((path: PathLike) => {
        if (path === 'chromatic.config.json') {
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
      expect(mockedReadFile).not.toHaveBeenCalledWith('chromatic.config.json', 'utf8');
    });
  });

  it('errors when the specified file does not exist, even if a default exists', async () => {
    mockedExistsSync.mockImplementation((path: PathLike) => {
      if (path === 'chromatic.config.json') {
        return true;
      }

      return false;
    });
    mockedReadFile.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    await expect(getConfiguration('missing.json')).rejects.toThrow(/could not be found/);

    expect(mockedReadFile).toHaveBeenCalledWith('missing.json', 'utf8');
    expect(mockedReadFile).not.toHaveBeenCalledWith('chromatic.config.json', 'utf8');
  });

  it('returns nothing if there is no config file and it was not specified', async () => {
    mockedExistsSync.mockReturnValue(false);

    expect(await getConfiguration()).toEqual({});
    expect(mockedReadFile).not.toHaveBeenCalled();
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

describe('reactNative config', () => {
  it('accepts a valid reactNative config', async () => {
    mockedReadFile.mockReturnValue(
      JSON.stringify({
        reactNative: {
          iosBuildCommand: 'my-ios-build',
          androidBuildCommand: 'my-android-build',
        },
      })
    );

    expect(await getConfiguration()).toMatchObject({
      reactNative: {
        iosBuildCommand: 'my-ios-build',
        androidBuildCommand: 'my-android-build',
      },
    });
  });

  it('accepts a partial reactNative config', async () => {
    mockedReadFile.mockReturnValue(
      JSON.stringify({
        reactNative: {
          iosBuildCommand: 'my-ios-build',
        },
      })
    );

    expect(await getConfiguration()).toMatchObject({
      reactNative: { iosBuildCommand: 'my-ios-build' },
    });
  });

  it('accepts config without reactNative', async () => {
    mockedReadFile.mockReturnValue(JSON.stringify({ projectId: 'project-id' }));

    const config = await getConfiguration();
    expect(config.reactNative).toBeUndefined();
  });

  it('accepts a configuration containing a gitTimeout', async () => {
    mockedReadFile.mockReturnValue(
      JSON.stringify({
        gitTimeout: 30,
      })
    );

    const config = await getConfiguration();
    expect(config.gitTimeout).toBe(30);
  });

  it('leaves gitTimeout undefined when not specified in config', async () => {
    mockedReadFile.mockReturnValue(JSON.stringify({ projectId: 'project-id' }));

    const config = await getConfiguration();
    expect(config.gitTimeout).toBeUndefined();
  });
});

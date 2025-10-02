/* eslint-disable complexity */
/* eslint-disable unicorn/prefer-module */
/* eslint-disable max-statements */
/* eslint-disable unicorn/prefer-ternary */
import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getInputs } from './getInputs';

describe('getInputs', () => {
  const originalEnvironment = process.env;

  // Helper function to set up environment variables from a configuration object
  const setupInputs = (config: Record<string, string | string[]>) => {
    for (const [key, value] of Object.entries(config)) {
      const environmentKey = `INPUT_${key.toUpperCase()}`;
      if (Array.isArray(value)) {
        // For multiline inputs, join with newlines
        process.env[environmentKey] = value.join('\n');
      } else {
        process.env[environmentKey] = value;
      }
    }
  };

  const setupInputsFromFile = (configurationFile: string) => {
    const yamlContent = fs.readFileSync(configurationFile, 'utf8');
    const parsed = yaml.load(yamlContent) as any;

    // Find the Chromatic action step in the workflow
    let chromaticStep;
    if (Array.isArray(parsed)) {
      // Handle array of steps
      chromaticStep = parsed.find((step) => step.uses && step.uses.includes('chromaui/action'));
    } else if (parsed.jobs) {
      // Handle workflow with jobs
      for (const jobName of Object.keys(parsed.jobs)) {
        const job = parsed.jobs[jobName];
        if (job.steps && Array.isArray(job.steps)) {
          chromaticStep = job.steps.find(
            (step: any) => step.uses && step.uses.includes('chromaui/action')
          );
          if (chromaticStep) break;
        }
      }
    } else if (parsed.uses && parsed.uses.includes('chromaui/action')) {
      // Handle single step
      chromaticStep = parsed;
    }

    if (!chromaticStep || !chromaticStep.with) {
      throw new Error(`No Chromatic action step found in ${configurationFile}`);
    }

    // Convert the 'with' section to environment variables
    for (const [key, value] of Object.entries(chromaticStep.with)) {
      const environmentKey = `INPUT_${key.toUpperCase()}`;

      if (typeof value === 'string') {
        // Handle multiline strings (YAML literal block style)
        if (value.includes('\n')) {
          // Split by newlines and filter out empty lines
          const lines = value.split('\n').filter((line) => line.trim() !== '');
          process.env[environmentKey] = lines.join('\n');
        } else {
          process.env[environmentKey] = value;
        }
      } else if (Array.isArray(value)) {
        // Handle arrays
        process.env[environmentKey] = value.join('\n');
      } else {
        // Handle other types by converting to string
        process.env[environmentKey] = String(value);
      }
    }
  };

  beforeEach(() => {
    // Clear all INPUT_* environment variables to avoid test interference
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('INPUT_')) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnvironment;
  });

  describe('when no inputs are provided', () => {
    it('should return empty inputs', () => {
      expect(getInputs()).toEqual({
        autoAcceptChanges: '',
        branchName: '',
        buildScriptName: '',
        buildCommand: '',
        configFile: '',
        cypress: '',
        debug: '',
        diagnosticsFile: '',
        dryRun: '',
        exitOnceUploaded: '',
        exitZeroOnChanges: '',
        externals: [],
        fileHashing: '',
        forceRebuild: '',
        ignoreLastBuildOnBranch: '',
        interactive: false,
        logFile: '',
        logLevel: '',
        logPrefix: '',
        onlyChanged: '',
        onlyStoryFiles: [],
        onlyStoryNames: [],
        outputDir: '',
        playwright: '',
        preserveMissing: '',
        projectToken: '',
        repositorySlug: '',
        skip: '',
        skipUpdateCheck: '',
        storybookBaseDir: '',
        storybookBuildDir: '',
        storybookConfigDir: '',
        storybookLogFile: '',
        traceChanged: '',
        untraced: [],
        uploadMetadata: '',
        zip: '',
        junitReport: '',
        workingDir: '',
      });
    });
  });

  describe('when specific inputs are provided via environment variables', () => {
    it('should return the provided input values', () => {
      // Set environment variables to simulate a different action.yml configuration
      // This simulates what GitHub Actions would set based on action.yml inputs
      process.env.INPUT_PROJECTTOKEN = 'test-token-123';
      process.env.INPUT_BRANCHNAME = 'feature/test-branch';
      process.env.INPUT_BUILDSCRIPTNAME = 'build-storybook';
      process.env.INPUT_DEBUG = 'true';
      process.env.INPUT_DRYRUN = 'false';
      process.env.INPUT_LOGLEVEL = 'debug';
      process.env.INPUT_STORYBOOKBASEDIR = './storybook';
      process.env.INPUT_WORKINGDIR = './custom-dir';

      // For multiline inputs, GitHub Actions sets them as newline-separated strings
      process.env.INPUT_EXTERNALS = 'package.json\nyarn.lock';
      process.env.INPUT_ONLYSTORYFILES = 'Button.stories.js\nInput.stories.js';
      process.env.INPUT_ONLYSTORYNAMES = 'Button--Primary\nInput--Default';
      process.env.INPUT_UNTRACED = 'node_modules/**\ndist/**';

      const result = getInputs();

      expect(result.projectToken).toBe('test-token-123');
      expect(result.branchName).toBe('feature/test-branch');
      expect(result.buildScriptName).toBe('build-storybook');
      expect(result.debug).toBe('true');
      expect(result.dryRun).toBe('false');
      expect(result.logLevel).toBe('debug');
      expect(result.storybookBaseDir).toBe('./storybook');
      expect(result.workingDir).toBe('./custom-dir');
      expect(result.externals).toEqual(['package.json', 'yarn.lock']);
      expect(result.onlyStoryFiles).toEqual(['Button.stories.js', 'Input.stories.js']);
      expect(result.onlyStoryNames).toEqual(['Button--Primary', 'Input--Default']);
      expect(result.untraced).toEqual(['node_modules/**', 'dist/**']);
      expect(result.interactive).toBe(false); // This is hardcoded in the function
    });
  });

  describe('when workingDirectory is provided as fallback', () => {
    it('should use workingDirectory when workingDir is not provided', () => {
      process.env.INPUT_WORKINGDIRECTORY = './fallback-dir';

      const result = getInputs();
      expect(result.workingDir).toBe('./fallback-dir');
    });

    it('should prefer workingDir over workingDirectory', () => {
      process.env.INPUT_WORKINGDIR = './preferred-dir';
      process.env.INPUT_WORKINGDIRECTORY = './fallback-dir';

      const result = getInputs();
      expect(result.workingDir).toBe('./preferred-dir');
    });
  });

  describe('simulating different action.yml configurations', () => {
    it('should handle a minimal action.yml configuration', () => {
      // Simulate a minimal action.yml with only essential inputs
      process.env.INPUT_PROJECTTOKEN = 'minimal-token';
      process.env.INPUT_BRANCHNAME = 'main';

      const result = getInputs();

      expect(result.projectToken).toBe('minimal-token');
      expect(result.branchName).toBe('main');
      expect(result.buildScriptName).toBe(''); // Not provided
      expect(result.debug).toBe(''); // Not provided
      expect(result.externals).toEqual([]); // Empty array for multiline inputs
    });

    it('should handle a comprehensive action.yml configuration', () => {
      // Simulate a comprehensive action.yml with many inputs
      process.env.INPUT_PROJECTTOKEN = 'comprehensive-token-456';
      process.env.INPUT_BRANCHNAME = 'feature/comprehensive-test';
      process.env.INPUT_BUILDSCRIPTNAME = 'build-storybook';
      process.env.INPUT_BUILDCOMMAND = 'npm run build-storybook -- --quiet';
      process.env.INPUT_CONFIGFILE = './chromatic.config.json';
      process.env.INPUT_DEBUG = 'true';
      process.env.INPUT_DRYRUN = 'false';
      process.env.INPUT_EXITONCEUPLOADED = 'true';
      process.env.INPUT_EXITZEROONCHANGES = 'false';
      process.env.INPUT_FILEHASHING = 'true';
      process.env.INPUT_FORCEREBUILD = 'false';
      process.env.INPUT_IGNORELASTBUILDONBRANCH = 'true';
      process.env.INPUT_LOGFILE = './chromatic.log';
      process.env.INPUT_LOGLEVEL = 'debug';
      process.env.INPUT_LOGPREFIX = 'CHROMATIC';
      process.env.INPUT_ONLYCHANGED = 'true';
      process.env.INPUT_OUTPUTDIR = './storybook-static';
      process.env.INPUT_PLAYWRIGHT = 'false';
      process.env.INPUT_PRESERVEMISSING = 'false';
      process.env.INPUT_REPOSITORYSLUG = 'owner/repo';
      process.env.INPUT_SKIP = 'false';
      process.env.INPUT_SKIPUPDATECHECK = 'true';
      process.env.INPUT_STORYBOOKBASEDIR = './packages/storybook';
      process.env.INPUT_STORYBOOKBUILDDIR = './packages/storybook/dist';
      process.env.INPUT_STORYBOOKCONFIGDIR = './packages/storybook/.storybook';
      process.env.INPUT_STORYBOOKLOGFILE = './storybook-build.log';
      process.env.INPUT_TRACECHANGED = 'expanded';
      process.env.INPUT_UPLOADMETADATA = 'true';
      process.env.INPUT_WORKINGDIR = './packages/app';
      process.env.INPUT_ZIP = 'false';
      process.env.INPUT_JUNITREPORT = './test-results.xml';

      // Multiline inputs
      process.env.INPUT_EXTERNALS = 'package.json\nyarn.lock\ntsconfig.json\njest.config.js';
      process.env.INPUT_ONLYSTORYFILES = 'Button.stories.js\nInput.stories.js\nCard.stories.js';
      process.env.INPUT_ONLYSTORYNAMES =
        'Button--Primary\nButton--Secondary\nInput--Default\nInput--WithError';
      process.env.INPUT_UNTRACED = 'node_modules/**\ndist/**\ncoverage/**\n*.test.js\n*.spec.js';

      const result = getInputs();

      // Test some key values
      expect(result.projectToken).toBe('comprehensive-token-456');
      expect(result.branchName).toBe('feature/comprehensive-test');
      expect(result.buildScriptName).toBe('build-storybook');
      expect(result.debug).toBe('true');
      expect(result.logLevel).toBe('debug');
      expect(result.externals).toEqual([
        'package.json',
        'yarn.lock',
        'tsconfig.json',
        'jest.config.js',
      ]);
      expect(result.onlyStoryFiles).toEqual([
        'Button.stories.js',
        'Input.stories.js',
        'Card.stories.js',
      ]);
      expect(result.onlyStoryNames).toEqual([
        'Button--Primary',
        'Button--Secondary',
        'Input--Default',
        'Input--WithError',
      ]);
      expect(result.untraced).toEqual([
        'node_modules/**',
        'dist/**',
        'coverage/**',
        '*.test.js',
        '*.spec.js',
      ]);
    });
  });

  describe('using helper function to simulate workflow yml files', () => {
    it('should simulate the chromatic-withMultilineExternals configuration', () => {
      setupInputsFromFile(path.join(__dirname, 'fixtures', 'chromatic-withMultilineExternals.yml'));
      const result = getInputs();

      expect(result.projectToken).toBe('${{ secrets.TOKEN }}');
      expect(result.externals).toEqual(['{first argument}', '{second argument}']);
      expect(result.skip).toBe('true');
    });

    it('should simulate a comprehensive workflow configuration', () => {
      setupInputsFromFile(path.join(__dirname, 'fixtures', 'comprehensive-workflow.yml'));
      const result = getInputs();

      expect(result.projectToken).toBe('123abc6712as');
      expect(result.branchName).toBe('${{ github.head_ref }}');
      expect(result.buildScriptName).toBe('build-storybook');
      expect(result.debug).toBe('true');
      expect(result.dryRun).toBe('false');
      expect(result.logLevel).toBe('debug');
      expect(result.externals).toEqual(['package.json', 'yarn.lock', 'tsconfig.json']);
      expect(result.onlyStoryFiles).toEqual(['Button.stories.js', 'Input.stories.js']);
      expect(result.onlyStoryNames).toEqual(['Button--Primary', 'Input--Default']);
      expect(result.workingDir).toBe('./packages/ui');
      expect(result.uploadMetadata).toBe('true');
      expect(result.junitReport).toBe('./test-results.xml');
      expect(result.skip).toEqual(['some/branch/**', '**/another/**', 'github/blah/blah/test/**']);
    });

    it('should simulate a production action.yml configuration', () => {
      // This simulates a production-like configuration
      setupInputs({
        projectToken: 'prod-token-xyz',
        branchName: 'main',
        buildScriptName: 'build-storybook',
        debug: 'false',
        dryRun: 'false',
        logLevel: 'info',
        fileHashing: 'true',
        forceRebuild: 'false',
        onlyChanged: 'true',
        externals: ['package.json', 'yarn.lock'],
        untraced: ['node_modules/**', 'dist/**'],
        workingDir: './',
      });

      const result = getInputs();

      expect(result.projectToken).toBe('prod-token-xyz');
      expect(result.branchName).toBe('main');
      expect(result.debug).toBe('false');
      expect(result.dryRun).toBe('false');
      expect(result.logLevel).toBe('info');
      expect(result.fileHashing).toBe('true');
      expect(result.forceRebuild).toBe('false');
      expect(result.onlyChanged).toBe('true');
      expect(result.externals).toEqual(['package.json', 'yarn.lock']);
      expect(result.untraced).toEqual(['node_modules/**', 'dist/**']);
      expect(result.workingDir).toBe('./');
    });

    it('should simulate a CI/CD action.yml configuration', () => {
      // This simulates a CI/CD pipeline configuration
      setupInputs({
        projectToken: 'ci-token-123',
        branchName: 'feature/ci-test',
        buildScriptName: 'build-storybook',
        debug: 'true',
        dryRun: 'false',
        logLevel: 'debug',
        exitOnceUploaded: 'true',
        exitZeroOnChanges: 'true',
        fileHashing: 'true',
        onlyChanged: 'true',
        externals: ['package.json', 'yarn.lock', 'tsconfig.json'],
        onlyStoryFiles: ['Button.stories.js', 'Input.stories.js'],
        untraced: ['node_modules/**', 'dist/**', 'coverage/**'],
        workingDir: './packages/ui',
        uploadMetadata: 'true',
        junitReport: './test-results.xml',
      });

      const result = getInputs();

      expect(result.projectToken).toBe('ci-token-123');
      expect(result.branchName).toBe('feature/ci-test');
      expect(result.debug).toBe('true');
      expect(result.exitOnceUploaded).toBe('true');
      expect(result.exitZeroOnChanges).toBe('true');
      expect(result.onlyChanged).toBe('true');
      expect(result.uploadMetadata).toBe('true');
      expect(result.junitReport).toBe('./test-results.xml');
      expect(result.workingDir).toBe('./packages/ui');
    });
  });
});

/* eslint-disable unicorn/prevent-abbreviations */
/* eslint-disable max-statements */
import { getInput, getMultilineInput } from '@actions/core';

/**
 * Retrieves a multiline input, but simplifies it to a single item if there is only one item in the array.
 *
 * @param name The name of the input to retrieve.
 *
 * @returns The simplified multiline input.
 */
function getSimplifiedMultilineInput(name: string, isGlob: boolean = false) {
  const input = getMultilineInput(name);
  if (input.length === 0) {
    return '';
  }

  if (input.length > 1 && isGlob) {
    return `@(${input.join('|')})`;
  }

  return input.length === 1 ? input[0] : input;
}

/**
 * Retrieves all the inputs from the action.yml file specific to the Chromatic github action.
 *
 * @returns An object containing all the inputs.
 */
export function getInputs() {
  // Remember to keep this list in sync with ../action.yml
  const autoAcceptChanges = getInput('autoAcceptChanges');
  const branchName = getInput('branchName');
  const buildScriptName = getInput('buildScriptName');
  const buildCommand = getInput('buildCommand');
  const configFile = getInput('configFile');
  const cypress = getInput('cypress');
  const debug = getInput('debug');
  const diagnosticsFile = getInput('diagnosticsFile');
  const dryRun = getInput('dryRun');
  const exitOnceUploaded = getInput('exitOnceUploaded');
  const exitZeroOnChanges = getInput('exitZeroOnChanges');
  const externals = getMultilineInput('externals');
  const fileHashing = getInput('fileHashing');
  const forceRebuild = getInput('forceRebuild');
  const ignoreLastBuildOnBranch = getInput('ignoreLastBuildOnBranch');
  const junitReport = getInput('junitReport');
  const logFile = getInput('logFile');
  const logLevel = getInput('logLevel');
  const logPrefix = getInput('logPrefix');
  const onlyChanged = getInput('onlyChanged');
  const onlyStoryFiles = getMultilineInput('onlyStoryFiles');
  const onlyStoryNames = getMultilineInput('onlyStoryNames');
  const outputDir = getInput('outputDir');
  const playwright = getInput('playwright');
  const preserveMissing = getInput('preserveMissing');
  const projectToken = getInput('projectToken');
  const repositorySlug = getInput('repositorySlug');

  // Skip should be treated as a glob
  const skip = getSimplifiedMultilineInput('skip', true);
  const skipUpdateCheck = getInput('skipUpdateCheck');
  const storybookBaseDir = getInput('storybookBaseDir');
  const storybookBuildDir = getInput('storybookBuildDir');
  const storybookConfigDir = getInput('storybookConfigDir');
  const storybookLogFile = getInput('storybookLogFile');
  const traceChanged = getInput('traceChanged');
  const untraced = getMultilineInput('untraced');
  const uploadMetadata = getInput('uploadMetadata');
  const workingDir = getInput('workingDir') || getInput('workingDirectory');
  const zip = getInput('zip');

  return {
    autoAcceptChanges,
    branchName,
    buildScriptName,
    buildCommand,
    configFile,
    cypress,
    debug,
    diagnosticsFile,
    dryRun,
    exitOnceUploaded,
    exitZeroOnChanges,
    externals,
    fileHashing,
    forceRebuild,
    ignoreLastBuildOnBranch,
    interactive: false,
    junitReport,
    logFile,
    logLevel,
    logPrefix,
    onlyChanged,
    onlyStoryFiles,
    onlyStoryNames,
    outputDir,
    playwright,
    preserveMissing,
    projectToken,
    repositorySlug,
    skip,
    skipUpdateCheck,
    storybookBaseDir,
    storybookBuildDir,
    storybookConfigDir,
    storybookLogFile,
    traceChanged,
    untraced,
    uploadMetadata,
    workingDir,
    zip,
  };
}

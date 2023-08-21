import path from 'path';
import { Context, Options } from '../types';

import dependentOption from '../ui/messages/errors/dependentOption';
import duplicatePatchBuild from '../ui/messages/errors/duplicatePatchBuild';
import incompatibleOptions from '../ui/messages/errors/incompatibleOptions';
import invalidOnlyStoryNames from '../ui/messages/errors/invalidOnlyStoryNames';
import invalidOwnerName from '../ui/messages/errors/invalidOwnerName';
import invalidPatchBuild from '../ui/messages/errors/invalidPatchBuild';
import invalidReportPath from '../ui/messages/errors/invalidReportPath';
import invalidRepositorySlug from '../ui/messages/errors/invalidRepositorySlug';
import invalidSingularOptions from '../ui/messages/errors/invalidSingularOptions';
import missingBuildScriptName from '../ui/messages/errors/missingBuildScriptName';
import missingProjectToken from '../ui/messages/errors/missingProjectToken';
import deprecatedOption from '../ui/messages/warnings/deprecatedOption';

const takeLast = (input: string | string[]) =>
  Array.isArray(input) ? input[input.length - 1] : input;

const ensureArray = (input: string | string[]) => (Array.isArray(input) ? input : [input]);

const trueIfSet = <T>(value: T) => ((value as unknown) === '' ? true : value);
const undefinedIfEmpty = <T>(array: T[]) => {
  const filtered = array.filter(Boolean);
  return filtered.length ? filtered : undefined;
};

export default function getOptions({ argv, env, flags, log, packageJson }: Context): Options {
  const fromCI = !!flags.ci || !!process.env.CI;
  const [patchHeadRef, patchBaseRef] = (flags.patchBuild || '').split('...').filter(Boolean);
  const [branchName, branchOwner] = (flags.branchName || '').split(':').reverse();
  const [repositoryOwner, repositoryName, ...rest] = flags.repositorySlug?.split('/') || [];

  const options: Options = {
    projectToken: takeLast(flags.projectToken || flags.appCode) || env.CHROMATIC_PROJECT_TOKEN, // backwards compatibility

    onlyChanged: trueIfSet(flags.onlyChanged),
    onlyStoryFiles: undefinedIfEmpty(ensureArray(flags.onlyStoryFiles)),
    onlyStoryNames: undefinedIfEmpty(ensureArray(flags.onlyStoryNames || flags.only)),
    untraced: undefinedIfEmpty(ensureArray(flags.untraced)),
    externals: undefinedIfEmpty(ensureArray(flags.externals)),
    traceChanged: trueIfSet(flags.traceChanged),
    list: flags.list,
    fromCI,
    skip: trueIfSet(flags.skip),
    dryRun: !!flags.dryRun,
    forceRebuild: trueIfSet(flags.forceRebuild),
    verbose: !!flags.debug,
    interactive:
      !fromCI &&
      !flags.debug &&
      !!flags.interactive &&
      !!process.stdout.isTTY &&
      process.env.NODE_ENV !== 'test',
    junitReport: trueIfSet(flags.junitReport),
    zip: flags.zip,

    autoAcceptChanges: trueIfSet(flags.autoAcceptChanges),
    exitZeroOnChanges: trueIfSet(flags.exitZeroOnChanges),
    exitOnceUploaded: trueIfSet(flags.exitOnceUploaded),
    isLocalBuild: false,
    ignoreLastBuildOnBranch: flags.ignoreLastBuildOnBranch,
    // deprecated
    preserveMissingSpecs: flags.preserveMissing || !!flags.only,
    originalArgv: argv,

    buildScriptName: flags.buildScriptName,
    outputDir: takeLast(flags.outputDir),
    allowConsoleErrors: flags.allowConsoleErrors,
    storybookBuildDir: takeLast(flags.storybookBuildDir),
    storybookBaseDir: flags.storybookBaseDir,
    storybookConfigDir: flags.storybookConfigDir,

    ownerName: branchOwner || repositoryOwner,
    repositorySlug: flags.repositorySlug,
    branchName,
    patchHeadRef,
    patchBaseRef,
  };

  if (flags.debug) {
    log.setLevel('debug');
    log.setInteractive(false);
  }

  if (!options.projectToken) {
    throw new Error(missingProjectToken());
  }

  if (repositoryOwner && (!repositoryName || rest.length)) {
    throw new Error(invalidRepositorySlug());
  }

  if (branchOwner && repositoryOwner && branchOwner !== repositoryOwner) {
    throw new Error(invalidOwnerName(branchOwner, repositoryOwner));
  }

  if (flags.patchBuild) {
    if (!options.patchHeadRef || !options.patchBaseRef) {
      throw new Error(invalidPatchBuild());
    }
    if (options.patchHeadRef === options.patchBaseRef) {
      throw new Error(duplicatePatchBuild());
    }
  }

  if (options.onlyStoryNames?.some((glob) => !/[\w*]\/[\w*]/.test(glob))) {
    throw new Error(invalidOnlyStoryNames());
  }

  const { storybookBuildDir } = options;
  let { buildScriptName } = options;

  // We can only have one of these arguments
  const singularOpts = {
    buildScriptName: '--build-script-name',
    storybookBuildDir: '--storybook-build-dir',
  };
  const foundSingularOpts = Object.keys(singularOpts).filter((name) => !!options[name]);

  if (foundSingularOpts.length > 1) {
    throw new Error(invalidSingularOptions(foundSingularOpts.map((key) => singularOpts[key])));
  }

  if (options.onlyChanged && options.onlyStoryFiles) {
    throw new Error(invalidSingularOptions(['--only-changed', '--only-story-files']));
  }
  if (options.onlyChanged && options.onlyStoryNames) {
    throw new Error(invalidSingularOptions(['--only-changed', '--only-story-names']));
  }
  if (options.onlyStoryNames && options.onlyStoryFiles) {
    throw new Error(invalidSingularOptions(['--only-story-files', '--only-story-names']));
  }

  if (options.untraced && !options.onlyChanged) {
    throw new Error(dependentOption('--untraced', '--only-changed'));
  }

  if (options.externals && !options.onlyChanged) {
    throw new Error(dependentOption('--externals', '--only-changed'));
  }

  if (options.traceChanged && !options.onlyChanged) {
    throw new Error(dependentOption('--trace-changed', '--only-changed'));
  }

  if (options.junitReport && options.exitOnceUploaded) {
    throw new Error(incompatibleOptions(['--junit-report', '--exit-once-uploaded']));
  }

  if (typeof options.junitReport === 'string' && path.extname(options.junitReport) !== '.xml') {
    throw new Error(invalidReportPath());
  }

  if (flags.only) {
    log.info('');
    log.info(deprecatedOption({ flag: 'only', replacement: 'onlyStoryNames' }));
  }

  if (flags.preserveMissing) {
    log.info('');
    log.info(deprecatedOption({ flag: 'preserveMissing' }));
  }

  // Build Storybook
  if (storybookBuildDir) {
    return options;
  }

  const { scripts } = packageJson;
  if (typeof buildScriptName !== 'string') {
    buildScriptName = 'build-storybook';
    if (!scripts[buildScriptName]) {
      const [key] =
        Object.entries(scripts as Record<string, string>).find(([, script]) =>
          script.startsWith('build-storybook')
        ) || [];
      if (key) buildScriptName = key;
    }
  }

  if (scripts && buildScriptName && scripts[buildScriptName]) {
    return { ...options, buildScriptName };
  }

  throw new Error(missingBuildScriptName(buildScriptName));
}

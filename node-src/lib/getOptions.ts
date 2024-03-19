import path from 'path';

import { InitialContext, Options } from '..';
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
import invalidPackageJson from '../ui/messages/errors/invalidPackageJson';
import { isE2EBuild } from './e2e';

const takeLast = (input: string | string[]) =>
  Array.isArray(input) ? input[input.length - 1] : input;

const ensureArray = (input: string | string[]) => (Array.isArray(input) ? input : [input]);

const trueIfSet = <T>(value: T) => ((value as unknown) === '' ? true : value);
const defaultIfSet = <T>(value: T, fallback: T) => ((value as unknown) === '' ? fallback : value);
const defaultUnlessSet = <T>(value: T, fallback: T) =>
  ['', true, undefined].includes(value as any) ? fallback : value;
const undefinedIfEmpty = <T>(array: T[]) => {
  const filtered = array.filter(Boolean);
  return filtered.length ? filtered : undefined;
};

const stripUndefined = (object: Partial<Options>): Partial<Options> =>
  Object.fromEntries(Object.entries(object).filter(([_, v]) => v !== undefined));

export default function getOptions({
  argv,
  env,
  flags,
  extraOptions,
  configuration,
  log,
  packageJson,
  packagePath,
}: InitialContext): Options {
  const defaultOptions = {
    projectToken: env.CHROMATIC_PROJECT_TOKEN,
    fromCI: !!process.env.CI,
    inAction: false,
    dryRun: false,
    debug: false,
    autoAcceptChanges: false,
    exitZeroOnChanges: false,
    exitOnceUploaded: false,
    diagnosticsFile: undefined,
    fileHashing: true,
    interactive: false,
    isLocalBuild: false,
    originalArgv: argv,

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
    skipUpdateCheck: undefined,

    ignoreLastBuildOnBranch: undefined,
    preserveMissingSpecs: undefined,

    buildScriptName: undefined,
    playwright: undefined,
    cypress: undefined,
    outputDir: undefined,
    allowConsoleErrors: undefined,
    storybookBuildDir: undefined,
    storybookBaseDir: undefined,
    storybookConfigDir: undefined,
    storybookLogFile: undefined,

    ownerName: undefined,
    repositorySlug: undefined,
    branchName: undefined,
    patchHeadRef: undefined,
    patchBaseRef: undefined,
    uploadMetadata: undefined,
  };

  const [patchHeadRef, patchBaseRef] = (flags.patchBuild || '').split('...').filter(Boolean);
  const [branchName, branchOwner] = (flags.branchName || '').split(':').reverse();
  const [repositoryOwner, repositoryName, ...rest] = flags.repositorySlug?.split('/') || [];

  const DEFAULT_LOG_FILE = 'chromatic.log';
  const DEFAULT_REPORT_FILE = 'chromatic-build-{buildNumber}.xml';
  const DEFAULT_DIAGNOSTICS_FILE = 'chromatic-diagnostics.json';
  const DEFAULT_STORYBOOK_LOG_FILE = 'build-storybook.log';

  // We need to strip out undefined because they otherwise they override anyway
  const optionsFromFlags = stripUndefined({
    projectToken: takeLast(flags.projectToken || flags.appCode),

    onlyChanged: trueIfSet(flags.onlyChanged),
    onlyStoryFiles: undefinedIfEmpty(ensureArray(flags.onlyStoryFiles)),
    onlyStoryNames: undefinedIfEmpty(ensureArray(flags.onlyStoryNames || flags.only)),
    untraced: undefinedIfEmpty(ensureArray(flags.untraced)),
    externals: undefinedIfEmpty(ensureArray(flags.externals)),
    traceChanged: trueIfSet(flags.traceChanged),
    list: flags.list,
    logFile: defaultIfSet(flags.logFile, DEFAULT_LOG_FILE),
    fromCI: flags.ci,
    skip: trueIfSet(flags.skip),
    dryRun: flags.dryRun,
    fileHashing: flags.fileHashing,
    forceRebuild: trueIfSet(flags.forceRebuild),
    debug: flags.debug,
    diagnosticsFile:
      defaultIfSet(flags.diagnosticsFile, DEFAULT_DIAGNOSTICS_FILE) ||
      defaultIfSet(flags.diagnostics && '', DEFAULT_DIAGNOSTICS_FILE), // for backwards compatibility
    junitReport: defaultIfSet(flags.junitReport, DEFAULT_REPORT_FILE),
    zip: flags.zip,
    skipUpdateCheck: flags.skipUpdateCheck,

    autoAcceptChanges: trueIfSet(flags.autoAcceptChanges),
    exitZeroOnChanges: trueIfSet(flags.exitZeroOnChanges),
    exitOnceUploaded: trueIfSet(flags.exitOnceUploaded),
    ignoreLastBuildOnBranch: flags.ignoreLastBuildOnBranch,
    // deprecated
    preserveMissingSpecs:
      flags.preserveMissing || typeof flags.only === 'string' ? true : undefined,

    buildScriptName: flags.buildScriptName,
    playwright: trueIfSet(flags.playwright),
    cypress: trueIfSet(flags.cypress),
    outputDir: takeLast(flags.outputDir),
    allowConsoleErrors: flags.allowConsoleErrors,
    storybookBuildDir: takeLast(flags.storybookBuildDir),
    storybookBaseDir: flags.storybookBaseDir,
    storybookConfigDir: flags.storybookConfigDir,
    storybookLogFile: defaultUnlessSet(flags.storybookLogFile, DEFAULT_STORYBOOK_LOG_FILE),

    ownerName: branchOwner || repositoryOwner,
    repositorySlug: flags.repositorySlug,
    branchName,
    patchHeadRef,
    patchBaseRef,
    uploadMetadata: flags.uploadMetadata,
  });

  const options: Options = {
    ...defaultOptions,
    ...configuration,
    ...optionsFromFlags,
    ...extraOptions,

    // This option is sort of weird
    interactive:
      !process.env.CI &&
      !flags.ci &&
      !flags.debug &&
      !!flags.interactive &&
      !!process.stdout.isTTY &&
      process.env.NODE_ENV !== 'test',
  };

  if (options.debug) {
    log.setLevel('debug');
    log.setInteractive(false);
  }

  if (options.debug || options.uploadMetadata) {
    // Implicitly enable these options unless they're already enabled or explicitly disabled
    options.logFile = options.logFile ?? DEFAULT_LOG_FILE;
    options.diagnosticsFile = options.diagnosticsFile ?? DEFAULT_DIAGNOSTICS_FILE;
  }

  if (!options.projectToken && !(options.projectId && options.userToken)) {
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
    storybookBuildDir: '--storybook-build-dir',
    playwright: '--playwright',
    cypress: '--cypress',
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

  if (isE2EBuild(options)) {
    return options;
  }

  if (typeof packageJson !== 'object' || typeof packageJson.scripts !== 'object') {
    log.error(invalidPackageJson(packagePath));
    process.exit(252);
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

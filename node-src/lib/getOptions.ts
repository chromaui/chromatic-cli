import path from 'path';

import { InitialContext, Options } from '..';
import dependentOption from '../ui/messages/errors/dependentOption';
import duplicatePatchBuild from '../ui/messages/errors/duplicatePatchBuild';
import incompatibleOptions from '../ui/messages/errors/incompatibleOptions';
import invalidOnlyStoryNames from '../ui/messages/errors/invalidOnlyStoryNames';
import invalidOwnerName from '../ui/messages/errors/invalidOwnerName';
import invalidPackageJson from '../ui/messages/errors/invalidPackageJson';
import invalidPatchBuild from '../ui/messages/errors/invalidPatchBuild';
import invalidReportPath from '../ui/messages/errors/invalidReportPath';
import invalidRepositorySlug from '../ui/messages/errors/invalidRepositorySlug';
import invalidSingularOptions from '../ui/messages/errors/invalidSingularOptions';
import missingBuildScriptName from '../ui/messages/errors/missingBuildScriptName';
import missingProjectToken from '../ui/messages/errors/missingProjectToken';
import deprecatedOption from '../ui/messages/warnings/deprecatedOption';
import { isE2EBuild } from './e2e';

const takeLast = (input?: string | string[]) => (Array.isArray(input) ? input.at(-1) : input);

const ensureArray = (input?: string | string[]) => {
  if (!input) return [];

  return Array.isArray(input) ? input : [input];
};

const trueIfSet = <T>(value: T) => ((value as unknown) === '' ? true : value);
const defaultIfSet = <T>(value: T, fallback: T) => ((value as unknown) === '' ? fallback : value);
const defaultUnlessSet = <T>(value: T, fallback: T) =>
  ['', true, undefined].includes(value as any) ? fallback : value;
const undefinedIfEmpty = <T>(array: T[]) => {
  const filtered = array.filter(Boolean);
  return filtered.length > 0 ? filtered : undefined;
};

const stripUndefined = (object: Partial<Options>): Partial<Options> =>
  Object.fromEntries(Object.entries(object).filter(([_, v]) => v !== undefined));

const defaultUnlessSetOrFalse = (input: string | boolean | undefined, fallback: string) => {
  switch (typeof input) {
    case 'boolean':
      return input ? fallback : undefined;
    case 'string':
      return input || fallback;
    default:
      return;
  }
};

/**
 * Parse options set when executing the CLI.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns An object containing parsed options
 */
// TODO: refactor this function
// eslint-disable-next-line complexity, max-statements
export default function getOptions(ctx: InitialContext): Options {
  const { argv, env, flags, extraOptions, configuration, log, packageJson, packagePath } = ctx;

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

  const [patchHeadReference, patchBaseReference] = (flags.patchBuild || '')
    .split('...')
    .filter(Boolean);
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
      // for backwards compatibility
      flags.diagnostics
        ? DEFAULT_DIAGNOSTICS_FILE
        : undefined,
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
    patchHeadRef: patchHeadReference,
    patchBaseRef: patchBaseReference,
    uploadMetadata: flags.uploadMetadata,
  });

  // We need to parse boolean values and set their defaults
  const { logFile, diagnosticsFile, junitReport, storybookLogFile, ...restOfConfiguration } =
    configuration || {};
  const configurationOptions: Partial<Options> = stripUndefined({
    ...restOfConfiguration,
    logFile: defaultUnlessSetOrFalse(logFile, DEFAULT_LOG_FILE),
    diagnosticsFile: defaultUnlessSetOrFalse(diagnosticsFile, DEFAULT_DIAGNOSTICS_FILE),
    junitReport: defaultUnlessSetOrFalse(junitReport, DEFAULT_REPORT_FILE),
    storybookLogFile: defaultUnlessSetOrFalse(storybookLogFile, DEFAULT_STORYBOOK_LOG_FILE),
  });

  const potentialOptions: Partial<Options> = {
    ...defaultOptions,
    ...configurationOptions,
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

  if (potentialOptions.debug) {
    log.setLevel('debug');
    log.setInteractive(false);
  }

  if (potentialOptions.debug || potentialOptions.uploadMetadata) {
    // Implicitly enable these options unless they're already enabled or explicitly disabled
    potentialOptions.logFile = potentialOptions.logFile ?? DEFAULT_LOG_FILE;
    potentialOptions.diagnosticsFile = potentialOptions.diagnosticsFile ?? DEFAULT_DIAGNOSTICS_FILE;
  }

  if (
    !potentialOptions.projectToken &&
    !(potentialOptions.projectId && potentialOptions.userToken)
  ) {
    throw new Error(missingProjectToken());
  }

  if (repositoryOwner && (!repositoryName || rest.length > 0)) {
    throw new Error(invalidRepositorySlug());
  }

  if (branchOwner && repositoryOwner && branchOwner !== repositoryOwner) {
    throw new Error(invalidOwnerName(branchOwner, repositoryOwner));
  }

  if (flags.patchBuild) {
    if (!potentialOptions.patchHeadRef || !potentialOptions.patchBaseRef) {
      throw new Error(invalidPatchBuild());
    }
    if (potentialOptions.patchHeadRef === potentialOptions.patchBaseRef) {
      throw new Error(duplicatePatchBuild());
    }
  }

  if (potentialOptions.onlyStoryNames?.some((glob) => !/[\w*]\/[\w*]/.test(glob))) {
    throw new Error(invalidOnlyStoryNames());
  }

  const { storybookBuildDir } = potentialOptions;
  let { buildScriptName } = potentialOptions;

  // We can only have one of these arguments
  const singularOptions = {
    storybookBuildDir: '--storybook-build-dir',
    playwright: '--playwright',
    cypress: '--cypress',
  };
  const foundSingularOptions = Object.keys(singularOptions).filter(
    (name) => !!potentialOptions[name]
  );

  if (foundSingularOptions.length > 1) {
    throw new Error(
      invalidSingularOptions(foundSingularOptions.map((key) => singularOptions[key]))
    );
  }

  if (potentialOptions.onlyChanged && potentialOptions.onlyStoryFiles) {
    throw new Error(invalidSingularOptions(['--only-changed', '--only-story-files']));
  }
  if (potentialOptions.onlyChanged && potentialOptions.onlyStoryNames) {
    throw new Error(invalidSingularOptions(['--only-changed', '--only-story-names']));
  }
  if (potentialOptions.onlyStoryNames && potentialOptions.onlyStoryFiles) {
    throw new Error(invalidSingularOptions(['--only-story-files', '--only-story-names']));
  }

  if (potentialOptions.untraced && !potentialOptions.onlyChanged) {
    throw new Error(dependentOption('--untraced', '--only-changed'));
  }

  if (potentialOptions.externals && !potentialOptions.onlyChanged) {
    throw new Error(dependentOption('--externals', '--only-changed'));
  }

  if (potentialOptions.traceChanged && !potentialOptions.onlyChanged) {
    throw new Error(dependentOption('--trace-changed', '--only-changed'));
  }

  if (potentialOptions.junitReport && potentialOptions.exitOnceUploaded) {
    throw new Error(incompatibleOptions(['--junit-report', '--exit-once-uploaded']));
  }

  if (
    typeof potentialOptions.junitReport === 'string' &&
    path.extname(potentialOptions.junitReport) !== '.xml'
  ) {
    throw new Error(invalidReportPath());
  }

  // All options are validated and can now be used
  const options = potentialOptions as Options;

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

import path from 'path';

import dependentOption from '../ui/messages/errors/dependentOption';
import duplicatePatchBuild from '../ui/messages/errors/duplicatePatchBuild';
import incompatibleOptions from '../ui/messages/errors/incompatibleOptions';
import invalidExitOnceUploaded from '../ui/messages/errors/invalidExitOnceUploaded';
import invalidOnly from '../ui/messages/errors/invalidOnly';
import invalidOnlyChanged from '../ui/messages/errors/invalidOnlyChanged';
import invalidPatchBuild from '../ui/messages/errors/invalidPatchBuild';
import invalidReportPath from '../ui/messages/errors/invalidReportPath';
import invalidSingularOptions from '../ui/messages/errors/invalidSingularOptions';
import missingBuildScriptName from '../ui/messages/errors/missingBuildScriptName';
import missingProjectToken from '../ui/messages/errors/missingProjectToken';
import missingScriptName from '../ui/messages/errors/missingScriptName';
import missingStorybookPort from '../ui/messages/errors/missingStorybookPort';
import unknownStorybookPort from '../ui/messages/errors/unknownStorybookPort';
import inferredOptions from '../ui/messages/info/inferredOptions';
import getStorybookConfiguration from './getStorybookConfiguration';
import { Flags } from './parseArgs';

export interface Options {
  projectToken: string;

  only: Flags['only'];
  onlyChanged: true | string;
  untraced: Flags['untraced'];
  externals: Flags['externals'];
  traceChanged: true | string;
  list: Flags['list'];
  fromCI: boolean;
  skip: true | string;
  dryRun: Flags['dryRun'];
  forceRebuild: true | string;
  verbose: boolean;
  interactive: boolean;
  junitReport: true | string;
  zip: true | string;

  autoAcceptChanges: true | string;
  exitZeroOnChanges: true | string;
  exitOnceUploaded: true | string;
  ignoreLastBuildOnBranch: Flags['ignoreLastBuildOnBranch'];
  preserveMissingSpecs: boolean;
  originalArgv: string[];

  buildScriptName: Flags['buildScriptName'];
  outputDir: string;
  allowConsoleErrors: Flags['allowConsoleErrors'];
  scriptName: true | string;
  exec: Flags['exec'];
  noStart: Flags['doNotStart'];
  https: {
    cert: string;
    key: string;
    ca: string;
  };
  cert: Flags['storybookCert'];
  key: Flags['storybookKey'];
  ca: Flags['storybookCa'];
  url?: string;
  port: Flags['storybookPort'];
  storybookBuildDir: string;
  storybookBaseDir: Flags['storybookBaseDir'];
  storybookConfigDir: Flags['storybookConfigDir'];
  storybookUrl: Flags['storybookUrl'];
  createTunnel: boolean;
  useTunnel?: boolean;

  ownerName: string;
  branchName: string;
  patchHeadRef: string;
  patchBaseRef: string;
}

const takeLast = (input) => (Array.isArray(input) ? input[input.length - 1] : input);
const ensureArray = (input) => (Array.isArray(input) ? input : [input]);

const resolveHomeDir = (filepath) =>
  filepath && filepath.startsWith('~') ? path.join(process.env.HOME, filepath.slice(1)) : filepath;

const trueIfSet = (value) => (value === '' ? true : value);
const undefinedIfEmpty = (array) => {
  const filtered = array.filter(Boolean);
  return filtered.length ? filtered : undefined;
};

export default function getOptions({ argv, env, flags, log, packageJson }): Options {
  const fromCI = !!flags.ci || !!process.env.CI;
  const [patchHeadRef, patchBaseRef] = (flags.patchBuild || '').split('...').filter(Boolean);
  const [branchName, ownerName] = (flags.branchName || '').split(':').reverse();

  const options: Options = {
    projectToken: takeLast(flags.projectToken || flags.appCode) || env.CHROMATIC_PROJECT_TOKEN, // backwards compatibility

    only: flags.only,
    onlyChanged: trueIfSet(flags.onlyChanged),
    untraced: undefinedIfEmpty(ensureArray(flags.untraced)),
    externals: undefinedIfEmpty(ensureArray(flags.externals)),
    traceChanged: trueIfSet(flags.traceChanged),
    list: flags.list,
    fromCI,
    skip: trueIfSet(flags.skip),
    dryRun: !!flags.dryRun,
    forceRebuild: trueIfSet(flags.forceRebuild),
    verbose: !!flags.debug,
    interactive: !flags.debug && !fromCI && !!flags.interactive && !!process.stdout.isTTY,
    junitReport: trueIfSet(flags.junitReport),
    zip: trueIfSet(flags.zip),

    autoAcceptChanges: trueIfSet(flags.autoAcceptChanges),
    exitZeroOnChanges: trueIfSet(flags.exitZeroOnChanges),
    exitOnceUploaded: trueIfSet(flags.exitOnceUploaded),
    ignoreLastBuildOnBranch: flags.ignoreLastBuildOnBranch,
    preserveMissingSpecs: flags.preserveMissing || !!flags.only,
    originalArgv: argv,

    buildScriptName: flags.buildScriptName,
    outputDir: takeLast(flags.outputDir),
    allowConsoleErrors: flags.allowConsoleErrors,
    scriptName: trueIfSet(flags.scriptName),
    exec: flags.exec,
    noStart: !!flags.doNotStart,
    https: flags.storybookHttps,
    cert: flags.storybookCert,
    key: flags.storybookKey,
    ca: flags.storybookCa,
    port: flags.storybookPort,
    storybookBuildDir: takeLast(flags.storybookBuildDir),
    storybookBaseDir: flags.storybookBaseDir,
    storybookConfigDir: flags.storybookConfigDir,
    storybookUrl: flags.storybookUrl,
    createTunnel: !flags.storybookUrl && env.CHROMATIC_CREATE_TUNNEL !== 'false',

    ownerName,
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

  if (flags.patchBuild) {
    if (!options.patchHeadRef || !options.patchBaseRef) {
      throw new Error(invalidPatchBuild());
    }
    if (options.patchHeadRef === options.patchBaseRef) {
      throw new Error(duplicatePatchBuild());
    }
  }

  if (flags.only && !/[\w*]\/[\w*]/.test(flags.only)) {
    throw new Error(invalidOnly());
  }

  const { storybookBuildDir, exec } = options;
  let { port, storybookUrl, noStart, scriptName, buildScriptName } = options;
  let https = options.https && {
    cert: options.cert,
    key: options.key,
    ca: options.ca,
  };

  // We can only have one of these arguments
  const singularOpts = {
    buildScriptName: '--build-script-name',
    scriptName: '--script-name',
    exec: '--exec',
    storybookUrl: '--storybook-url',
    storybookBuildDir: '--storybook-build-dir',
  };
  const foundSingularOpts = Object.keys(singularOpts).filter((name) => !!options[name]);

  if (foundSingularOpts.length > 1) {
    throw new Error(invalidSingularOptions(foundSingularOpts.map((key) => singularOpts[key])));
  }

  if (options.only && options.onlyChanged) {
    throw new Error(invalidSingularOptions(['--only', '--only-changed']));
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

  // No need to start or build Storybook if we're going to fetch from a URL
  if (storybookUrl) {
    noStart = true;
  }

  if (noStart && options.exitOnceUploaded) {
    throw new Error(invalidExitOnceUploaded());
  }

  if (scriptName && options.exitOnceUploaded) {
    throw new Error(invalidExitOnceUploaded());
  }

  if (options.junitReport && options.exitOnceUploaded) {
    throw new Error(incompatibleOptions(['--junit-report', '--exit-once-uploaded']));
  }

  if (typeof options.junitReport === 'string' && path.extname(options.junitReport) !== '.xml') {
    throw new Error(invalidReportPath());
  }

  // Build Storybook instead of starting it
  if (!scriptName && !exec && !noStart && !storybookUrl && !port) {
    if (storybookBuildDir) {
      return { ...options, noStart: true, useTunnel: false };
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
      return { ...options, noStart: true, useTunnel: false, buildScriptName };
    }
    throw new Error(missingBuildScriptName(buildScriptName));
  }

  // TurboSnap requires a static build with a webpack stats file.
  if (options.onlyChanged) throw new Error(invalidOnlyChanged());

  // Start Storybook on localhost and generate the URL to it
  if (!storybookUrl) {
    if (exec && !port) {
      throw new Error(missingStorybookPort());
    }

    if (!exec && (!port || !noStart)) {
      // If you don't provide a port or we need to start the command, let's look up the script for it
      scriptName = typeof scriptName === 'string' ? scriptName : 'storybook';
      const storybookScript = packageJson.scripts && packageJson.scripts[scriptName];

      if (!storybookScript) {
        throw new Error(missingScriptName(scriptName));
      }

      https =
        https ||
        (getStorybookConfiguration(storybookScript, '--https') && {
          cert: resolveHomeDir(getStorybookConfiguration(storybookScript, '--ssl-cert')),
          key: resolveHomeDir(getStorybookConfiguration(storybookScript, '--ssl-key')),
          ca: resolveHomeDir(getStorybookConfiguration(storybookScript, '--ssl-ca')),
        });

      port = port || getStorybookConfiguration(storybookScript, '-p', '--port');
      if (!port) {
        throw new Error(unknownStorybookPort(scriptName));
      }

      if (log) log.info('', inferredOptions({ scriptName, port }));
    }

    storybookUrl = `${https ? 'https' : 'http'}://localhost:${port}`;
  }

  const parsedUrl = new URL(storybookUrl);
  const suffix = 'iframe.html';
  if (!parsedUrl.pathname.endsWith(suffix)) {
    if (!parsedUrl.pathname.endsWith('/')) {
      parsedUrl.pathname += '/';
    }
    parsedUrl.pathname += suffix;
  }

  return {
    ...options,
    noStart,
    useTunnel: true,
    https,
    url: parsedUrl.href,
    scriptName,
  };
}

import path from 'path';
import { parse } from 'url';

import duplicatePatchBuild from '../ui/messages/errors/duplicatePatchBuild';
import incompatibleOptions from '../ui/messages/errors/incompatibleOptions';
import invalidExitOnceUploaded from '../ui/messages/errors/invalidExitOnceUploaded';
import invalidOnly from '../ui/messages/errors/invalidOnly';
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

const takeLast = input => (Array.isArray(input) ? input[input.length - 1] : input);

const resolveHomeDir = filepath =>
  filepath && filepath.startsWith('~') ? path.join(process.env.HOME, filepath.slice(1)) : filepath;

export default async function getOptions({ argv, env, flags, log, packageJson }) {
  const fromCI = !!flags.ci || !!process.env.CI;
  const [patchHeadRef, patchBaseRef] = (flags.patchBuild || '').split('...').filter(Boolean);

  const options = {
    projectToken: takeLast(flags.projectToken || flags.appCode) || env.CHROMATIC_PROJECT_TOKEN, // backwards compatibility

    only: flags.only,
    list: flags.list,
    fromCI,
    skip: flags.skip === '' ? true : flags.skip,
    verbose: !!flags.debug,
    interactive: !flags.debug && !fromCI && !!flags.interactive && !!process.stdout.isTTY,
    junitReport: flags.junitReport === '' ? true : flags.junitReport,

    autoAcceptChanges: flags.autoAcceptChanges === '' ? true : flags.autoAcceptChanges,
    exitZeroOnChanges: flags.exitZeroOnChanges === '' ? true : flags.exitZeroOnChanges,
    exitOnceUploaded: flags.exitOnceUploaded === '' ? true : flags.exitOnceUploaded,
    ignoreLastBuildOnBranch: flags.ignoreLastBuildOnBranch,
    preserveMissingSpecs: flags.preserveMissing || !!flags.only,
    originalArgv: argv,

    buildScriptName: flags.buildScriptName,
    outputDir: flags.outputDir,
    allowConsoleErrors: flags.allowConsoleErrors,
    scriptName: flags.scriptName === '' ? true : flags.scriptName,
    exec: flags.exec,
    noStart: !!flags.doNotStart,
    https: flags.storybookHttps,
    cert: flags.storybookCert,
    key: flags.storybookKey,
    ca: flags.storybookCa,
    port: flags.storybookPort,
    storybookUrl: flags.storybookUrl === '' ? true : flags.storybookUrl,
    storybookBuildDir: flags.storybookBuildDir
      ? path.resolve(
          Array.isArray(flags.storybookBuildDir)
            ? flags.storybookBuildDir[0]
            : flags.storybookBuildDir
        )
      : undefined,
    createTunnel: !flags.storybookUrl && env.CHROMATIC_CREATE_TUNNEL !== 'false',

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
  const foundSingularOpts = Object.keys(singularOpts).filter(name => !!options[name]);

  if (foundSingularOpts.length > 1) {
    throw new Error(invalidSingularOptions(foundSingularOpts.map(key => singularOpts[key])));
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
    buildScriptName = typeof buildScriptName === 'string' ? buildScriptName : 'build-storybook';
    if (packageJson.scripts && packageJson.scripts[buildScriptName]) {
      return { ...options, noStart: true, useTunnel: false, buildScriptName };
    }
    throw new Error(missingBuildScriptName(buildScriptName));
  }

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

  const parsedUrl = parse(storybookUrl);
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
    url: parsedUrl.format(),
    scriptName,
  };
}

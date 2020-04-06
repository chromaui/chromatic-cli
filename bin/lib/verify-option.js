import { readFileSync } from 'jsonfile';
import path from 'path';
import paramCase from 'param-case';
import dedent from 'ts-dedent';
import { parse } from 'url';
import { v4 as uuid } from 'uuid';
import { CHROMATIC_CREATE_TUNNEL, CHROMATIC_PROJECT_TOKEN } from '../constants';
import { getStorybookConfiguration } from '../storybook/get-configuration';
import { resolveHomeDir } from './resolveHomeDir';
import { getProductVariables } from './cli';

import log from './log';

export async function verifyOptions(cli, argv) {
  const projectTokenInput = cli.projectToken || cli.appCode; // backwards compatibility

  const cliOptions = {
    projectToken: Array.isArray(projectTokenInput)
      ? projectTokenInput[projectTokenInput.length - 1]
      : projectTokenInput || CHROMATIC_PROJECT_TOKEN,
    config: cli.config,

    only: cli.only,
    list: cli.list,
    fromCI: !!cli.ci,
    skip: cli.skip === '' ? true : cli.skip,
    verbose: !!cli.debug,
    sessionId: uuid(),
    interactive: !cli.ci && !!cli.interactive,

    autoAcceptChanges: cli.autoAcceptChanges === '' ? true : cli.autoAcceptChanges,
    exitZeroOnChanges: cli.exitZeroOnChanges === '' ? true : cli.exitZeroOnChanges,
    exitOnceUploaded: cli.exitOnceUploaded === '' ? true : cli.exitOnceUploaded,
    ignoreLastBuildOnBranch: cli.ignoreLastBuildOnBranch,
    preserveMissingSpecs: cli.preserveMissing,
    originalArgv: argv,

    buildScriptName: cli.buildScriptName,
    allowConsoleErrors: cli.allowConsoleErrors,
    scriptName: cli.scriptName === '' ? true : cli.scriptName,
    exec: cli.exec,
    noStart: !!cli.doNotStart,
    https: cli.storybookHttps,
    cert: cli.storybookCert,
    key: cli.storybookKey,
    ca: cli.storybookCa,
    port: cli.storybookPort,
    storybookUrl: cli.storybookUrl === '' ? true : cli.storybookUrl,
    storybookBuildDir: cli.storybookBuildDir
      ? path.resolve(
          Array.isArray(cli.storybookBuildDir) ? cli.storybookBuildDir[0] : cli.storybookBuildDir
        )
      : undefined,
    createTunnel: !cli.storybookUrl && CHROMATIC_CREATE_TUNNEL !== 'false',

    patchBuild: cli.patchBuild && cli.patchBuild.split('...').filter(Boolean),
  };
  const names = getProductVariables();

  if (!cliOptions.projectToken) {
    throw new Error(dedent`
      You must provide an project token.

      If you don't have a project yet login to ${names.url} and create a new project.
      Or find your code on the manage page of an existing project.

      Pass your project token with the \`${names.envVar}\` environment variable or the \`--project-token\` flag.
    `);
  }

  if (cliOptions.patchBuild) {
    if (cliOptions.patchBuild.length !== 2) {
      throw new Error(
        'Invalid value to --patch-build, expecting two branch names like `headbranch...basebranch`.'
      );
    }
    if (cliOptions.patchBuild[0] === cliOptions.patchBuild[1]) {
      throw new Error('The two branches passed to --patch-build cannot be identical.');
    }
  }

  const packageJson = readFileSync(path.resolve('./package.json'));
  const { storybookBuildDir, exec } = cliOptions;
  let { port, storybookUrl, noStart, scriptName, buildScriptName } = cliOptions;
  let https = cliOptions.https && {
    cert: cliOptions.cert,
    key: cliOptions.key,
    ca: cliOptions.ca,
  };

  // We can only have one of these arguments
  const singularCommands = [
    'buildScriptName',
    'scriptName',
    'exec',
    'storybookUrl',
    'storybookBuildDir',
  ].filter(name => !!cliOptions[name]);
  if (singularCommands.length > 1) {
    throw new Error(
      `Can only use one of ${singularCommands.map(n => `--${paramCase(n)}`).join(', ')}.`
    );
  }

  // No need to start or build Storybook if we're going to fetch from a URL
  if (storybookUrl) {
    noStart = true;
  }

  if (noStart && cliOptions.exitOnceUploaded) {
    throw new Error(dedent`
      --exit-once-uploaded is only supported when you use build-storybook
    `);
  }

  if (scriptName && cliOptions.exitOnceUploaded) {
    throw new Error(dedent`
      --exit-once-uploaded is only supported when you use build-storybook
    `);
  }

  // Build Storybook instead of starting it
  if (!scriptName && !exec && !noStart && !storybookUrl && !port) {
    if (storybookBuildDir) {
      return { ...cliOptions, noStart: true };
    }
    buildScriptName = typeof buildScriptName === 'string' ? buildScriptName : 'build-storybook';
    if (packageJson.scripts && packageJson.scripts[buildScriptName]) {
      return { ...cliOptions, noStart: true, buildScriptName };
    }
    throw new Error(dedent`
      Didn't find a script called '${buildScriptName}' in your \`package.json\`.
      Make sure you set the \`--build-script-name\` option to the value of the npm script that builds your Storybook.
    `);
  }

  // Start Storybook on localhost and generate the URL to it
  if (!storybookUrl) {
    if (exec && !port) {
      throw new Error(`You must pass a port with the --storybook-port option when using --exec.`);
    }

    if (!exec && (!port || !noStart)) {
      // If you don't provide a port or we need to start the command, let's look up the script for it
      scriptName = typeof scriptName === 'string' ? scriptName : 'storybook';
      const storybookScript = packageJson.scripts && packageJson.scripts[scriptName];

      if (!storybookScript) {
        throw new Error(dedent`
          Didn't find a script called '${scriptName}' in your \`package.json\`.
          Make sure you set the \`--script-name\` option to the value of the npm script that starts your Storybook.
        `);
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
        throw new Error(
          `Didn't detect a port in your '${scriptName}' script. You must pass a port with the --storybook-port option.`
        );
      }

      log.log(
        '',
        dedent`
          Detected '${scriptName}' script, running with inferred options:
          --script-name=${scriptName} --storybook-port=${port}
          Override any of the above if they were inferred incorrectly.
        `
      );
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
    ...cliOptions,
    noStart,
    https,
    url: parsedUrl.format(),
    scriptName,
  };
}

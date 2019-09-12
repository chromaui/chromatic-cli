import denodeify from 'denodeify';
import { confirm } from 'node-ask';
import setupDebug from 'debug';
import kill from 'tree-kill';
import { parse, format } from 'url';
import { dirSync } from 'tmp';
import { gte } from 'semver';
import { stripIndents } from 'common-tags';

import getStorybookInfo from '../storybook/get-info';
import startApp, { checkResponse } from '../storybook/start-app';
import openTunnel from '../lib/tunnel';
import { checkPackageJson, addScriptToPackageJson } from '../lib/package-json';
import GraphQLClient from '../io/GraphQLClient';
import { getBaselineCommits } from '../git/git';
import { version as packageVersion } from '../../package.json';
import { getProductVariables } from '../lib/cli';
import {
  CHROMATIC_INDEX_URL,
  CHROMATIC_TUNNEL_URL,
  CHROMATIC_POLL_INTERVAL,
  ENVIRONMENT_WHITELIST,
  STORYBOOK_CLI_FLAGS_BY_VERSION,
} from '../constants';
import { uploadToS3 } from '../io/upload-to-s3';
import log from '../lib/log';
import {
  TesterBuildQuery,
  TesterCreateAppTokenMutation,
  TesterSkipBuildMutation,
  TesterCreateBuildMutation,
} from '../io/gql-queries';
import { pluralize } from '../lib/pluralize';

import { getCommitAndBranch } from '../git/getCommitAndBranch';
import { getStories } from '../storybook/getStories';

export const debug = setupDebug('chromatic-cli:tester');

let lastInProgressCount;
async function waitForBuild(client, variables, { diffs }) {
  const {
    app: { build },
  } = await client.runQuery(TesterBuildQuery, variables);

  debug(`build:${JSON.stringify(build)}`);
  const { status, inProgressCount, snapshotCount, changeCount, errorCount } = build;
  if (status === 'BUILD_IN_PROGRESS') {
    if (inProgressCount !== lastInProgressCount) {
      lastInProgressCount = inProgressCount;
      log.info(
        diffs
          ? `${inProgressCount}/${pluralize(snapshotCount, 'snapshot')} remain to test. ` +
              `(${pluralize(changeCount, 'change')}, ${pluralize(errorCount, 'error')})`
          : `${inProgressCount}/${pluralize(snapshotCount, 'story')} remain to publish. `
      );
    }
    await new Promise(resolve => setTimeout(resolve, CHROMATIC_POLL_INTERVAL));
    return waitForBuild(client, variables, { diffs });
  }

  return build;
}

async function prepareAppOrBuild({
  client,
  dirname,
  noStart,
  buildScriptName,
  scriptName,
  commandName,
  https,
  url,
  createTunnel,
  storybookVersion,
}) {
  const names = await getProductVariables();

  if (dirname || buildScriptName) {
    let buildDirName = dirname;
    if (buildScriptName) {
      log.info(`Building your Storybook`);
      ({ name: buildDirName } = dirSync({ unsafeCleanup: true, prefix: `${names.script}-` }));
      debug(`Building Storybook to ${buildDirName}`);

      const child = await startApp({
        scriptName: buildScriptName,
        // Make storybook build as quiet as possible
        args: [
          '--',
          '-o',
          buildDirName,
          ...(storybookVersion &&
          gte(storybookVersion, STORYBOOK_CLI_FLAGS_BY_VERSION['--loglevel'])
            ? ['--loglevel', 'error']
            : []),
        ],
        inheritStdio: true,
      });

      // Wait for the process to exit
      await new Promise((res, rej) => {
        child.on('error', rej);
        child.on('close', code => {
          if (code > 0) {
            rej(new Error(`${buildScriptName} script exited with code ${code}`));
          }
          res();
        });
      });
    }

    log.info(`Uploading your built Storybook...`);
    const isolatorUrl = await uploadToS3(buildDirName, client);
    debug(`uploading to s3, got ${isolatorUrl}`);
    log.info(`Uploaded your build, verifying`);

    return { isolatorUrl };
  }

  let cleanup;
  if (!noStart) {
    log.info(`Starting Storybook`);
    const child = await startApp({
      scriptName,
      commandName,
      url,
      args: scriptName &&
        storybookVersion &&
        gte(storybookVersion, STORYBOOK_CLI_FLAGS_BY_VERSION['--ci']) && ['--', '--ci'],
    });
    cleanup = child && (async () => denodeify(kill)(child.pid, 'SIGHUP'));
    log.info(`Started Storybook at ${url}`);
  } else if (url) {
    if (!(await checkResponse(url))) {
      throw new Error(`No server responding at ${url} -- make sure you've started it.`);
    }
    log.info(`Detected Storybook at ${url}`);
  }

  const { port, pathname, query, hash } = parse(url, true);
  if (!createTunnel) {
    return {
      cleanup,
      isolatorUrl: url,
    };
  }

  log.info(`Opening tunnel to Chromatic capture servers`);
  let tunnel;
  let cleanupTunnel;
  try {
    tunnel = await openTunnel({ port, https });
    cleanupTunnel = async () => {
      if (cleanup) {
        await cleanup();
      }
      await tunnel.close();
    };
    debug(`Opened tunnel to ${tunnel.url}`);
  } catch (err) {
    debug('Got error %O', err);
    if (cleanup) {
      cleanup();
    }
    throw err;
  }

  // ** Are we using a v1 or v2 tunnel? **
  // If the tunnel returns a cachedUrl, we are using a v2 tunnel and need to use
  // the slightly esoteric URL format for the isolatorUrl.
  // If not, they are the same:
  const cachedUrlObject = parse(tunnel.cachedUrl || tunnel.url);
  cachedUrlObject.pathname = pathname;
  cachedUrlObject.query = query;
  cachedUrlObject.hash = hash;
  const cachedUrl = cachedUrlObject.format();

  if (tunnel.cachedUrl) {
    const isolatorUrlObject = parse(tunnel.url, true);
    isolatorUrlObject.query = {
      ...isolatorUrlObject.query,
      // This will encode the pathname and query into a single query parameter
      path: format({ pathname, query }),
    };
    isolatorUrlObject.hash = hash;

    // For some reason we need to unset this to change the params
    isolatorUrlObject.search = null;

    return {
      cleanup: cleanupTunnel,
      isolatorUrl: isolatorUrlObject.format(),
      cachedUrl,
    };
  }

  // See comment about v1/v2 tunnel above
  return {
    cleanup: cleanupTunnel,
    isolatorUrl: cachedUrl,
  };
}

async function getEnvironment() {
  // We send up all environment variables provided by these complicated systems.
  // We don't want to send up *all* environment vars as they could include sensitive information
  // about the user's build environment
  const environment = JSON.stringify(
    Object.entries(process.env).reduce((acc, [key, value]) => {
      if (ENVIRONMENT_WHITELIST.find(regex => key.match(regex))) {
        acc[key] = value;
      }
      return acc;
    }, {})
  );
  debug(`Got environment %s`, environment);
  return environment;
}

export async function runTest({
  appCode,
  buildScriptName,
  scriptName,
  exec: commandName,
  noStart = false,
  https,
  url,
  storybookBuildDir: dirname,
  only,
  skip,
  list,
  fromCI: inputFromCI = false,
  autoAcceptChanges = false,
  exitZeroOnChanges = false,
  ignoreLastBuildOnBranch = false,
  preserveMissingSpecs = false,
  verbose = false,
  interactive = true,
  indexUrl = CHROMATIC_INDEX_URL,
  tunnelUrl = CHROMATIC_TUNNEL_URL,
  createTunnel = true,
  originalArgv = false,
  sessionId,
}) {
  const names = await getProductVariables();

  debug(`Creating build with session id: ${sessionId} - version: ${packageVersion}`);
  debug(
    `Connecting to index:${indexUrl} and ${
      createTunnel ? `using tunnel:${tunnelUrl}` : 'not creating a tunnel'
    }`
  );

  const client = new GraphQLClient({
    uri: `${indexUrl}/graphql`,
    headers: { 'x-chromatic-session-id': sessionId, 'x-chromatic-cli-version': packageVersion },
    retries: 3,
  });

  try {
    const { createAppToken: jwtToken } = await client.runQuery(TesterCreateAppTokenMutation, {
      appCode,
    });
    client.headers = { ...client.headers, Authorization: `Bearer ${jwtToken}` };
  } catch (errors) {
    if (errors[0] && errors[0].message && errors[0].message.match('No app with code')) {
      throw new Error(stripIndents`
        Incorrect app code '${appCode}'.
      
        If you don't have a project yet login to ${names.url} and create a new project.
        Or find your code on the manage page of an existing project.
      `);
    }
    throw errors;
  }

  const {
    commit,
    committedAt,
    committerEmail,
    committerName,
    branch,
    isTravisPrBuild,
    fromCI,
  } = await getCommitAndBranch({ inputFromCI });

  if (skip) {
    if (await client.runQuery(TesterSkipBuildMutation, { commit })) {
      log.info(`Build skipped for commit ${commit}.`);
      return 0;
    }
    throw new Error('Failed to skip build.');
  }

  if (!(buildScriptName || scriptName || commandName || noStart)) {
    throw new Error('Either buildScriptName, scriptName, commandName or noStart is required');
  }

  // These three options can be branch specific
  const doAutoAcceptChanges =
    typeof autoAcceptChanges === 'string' ? autoAcceptChanges === branch : autoAcceptChanges;
  const doExitZeroOnChanges =
    typeof exitZeroOnChanges === 'string' ? exitZeroOnChanges === branch : exitZeroOnChanges;
  const doIgnoreLastBuildOnBranch =
    typeof ignoreLastBuildOnBranch === 'string'
      ? ignoreLastBuildOnBranch === branch
      : ignoreLastBuildOnBranch;

  const baselineCommits = await getBaselineCommits(client, {
    branch,
    ignoreLastBuildOnBranch: doIgnoreLastBuildOnBranch,
  });
  debug(`Found baselineCommits: ${baselineCommits}`);

  const { version: storybookVersion, viewLayer } = await getStorybookInfo();
  debug(
    `Detected package version:${packageVersion}, storybook version:${storybookVersion}, view layer: ${viewLayer}`
  );

  let exitCode = 5;
  const { cleanup, isolatorUrl, cachedUrl } = await prepareAppOrBuild({
    storybookVersion,
    client,
    dirname,
    noStart,
    buildScriptName,
    scriptName,
    commandName,
    https,
    url,
    createTunnel,
    tunnelUrl,
  });
  debug(`Connecting to ${isolatorUrl} (cachedUrl ${cachedUrl})`);
  log.info(
    `Uploading and verifying build (this may take a few minutes depending on your connection)`
  );

  try {
    const { runtimeSpecs, storybookOptions } = await getStories({
      only,
      list,
      isolatorUrl,
      verbose,
    });

    const environment = await getEnvironment();

    const {
      createBuild: {
        number,
        snapshotCount,
        specCount,
        componentCount,
        webUrl,
        app: {
          account: {
            features: { diffs },
          },
        },
      },
    } = await client.runQuery(TesterCreateBuildMutation, {
      input: {
        cachedUrl,
        autoAcceptChanges: doAutoAcceptChanges,
        preserveMissingSpecs,
        branch,
        commit,
        committedAt,
        baselineCommits,
        runtimeSpecs,
        storybookOptions: JSON.stringify(storybookOptions),
        fromCI,
        isTravisPrBuild,
        packageVersion,
        storybookVersion,
        viewLayer,
        committerEmail,
        committerName,
        environment,
      },
      isolatorUrl,
    });

    const onlineHint = `View it online at ${webUrl}`;
    log.info(stripIndents`
      Started Build ${number} (${pluralize(componentCount, 'component')}, ${pluralize(
      specCount,
      'story'
    )}, ${pluralize(snapshotCount, 'snapshot')}).

      ${onlineHint}.
    `);

    const {
      status,
      autoAcceptChanges: buildAutoAcceptChanges, // if it is the first build, this may have been set
      changeCount,
      errorCount,
    } = await waitForBuild(client, { buildNumber: number }, { diffs });

    switch (status) {
      case 'BUILD_PASSED':
        log.info(
          diffs
            ? `Build ${number} passed! ${onlineHint}.`
            : `Build ${number} published! ${onlineHint}.`
        );
        exitCode = 0;
        break;
      // They may have sneakily looked at the build while we were waiting
      case 'BUILD_ACCEPTED':
      case 'BUILD_PENDING':
      case 'BUILD_DENIED':
        log.info(`Build ${number} has ${pluralize(changeCount, 'change')}. ${onlineHint}.`);
        exitCode = doExitZeroOnChanges || buildAutoAcceptChanges ? 0 : 1;
        if (exitCode !== 0) {
          log.info(stripIndents`
            Pass --exit-zero-on-changes if you want this command to exit successfully in this case.
            Alternatively, pass --auto-accept-changes if you want changed builds to pass on this branch.
            Read more: https://docs.chromaticqa.com/test
          `);
        }
        break;
      case 'BUILD_FAILED':
        log.info(
          diffs
            ? `Build ${number} has ${pluralize(errorCount, 'error')}. ${onlineHint}.`
            : `Build ${number} was published but we found errors. ${onlineHint}.`
        );
        exitCode = 2;
        break;
      case 'BUILD_TIMED_OUT':
      case 'BUILD_ERROR':
        log.info(`Build ${number} has failed to run. Our apologies. Please try again.`);
        exitCode = 3;
        break;
      default:
        throw new Error(`Unexpected build status: ${status}`);
    }
  } catch (e) {
    if (
      e.length &&
      e[0] &&
      e[0].message &&
      e[0].message.match(/Cannot run a build with no specs./)
    ) {
      log.info(e[0].message);
      exitCode = 255;
    } else {
      debug('Got error %O', e);
      throw e;
    }
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }

  if (!checkPackageJson(names) && originalArgv && !fromCI && interactive) {
    const scriptCommand = `${names.envVar}=${appCode} ${names.command} ${originalArgv
      .slice(2)
      .join(' ')}`
      .replace(/--app-code[= ]\S+/, '')
      .trim();

    const confirmed = await confirm(
      `\nYou have not added the \`${names.script}\` script to your \`package.json\`. Would you like me to do it for you?`
    );
    if (confirmed) {
      addScriptToPackageJson(names.script, scriptCommand);
      log.info(
        stripIndents`
        Added script \`${names.script}\`. You can now run it here or in CI with \`npm run ${names.script}\` (or \`yarn ${names.script}\`)

        NOTE: I wrote your app code to the \`${names.envVar}\` environment variable. 
        
        The app code cannot be used to read story data, it can only be used to create new builds.
        If you would still prefer not to check it into source control, you can remove it from \`package.json\` and set it via an environment variable instead.`,
        { noPrefix: true }
      );
    } else {
      log.info(
        stripIndents`
        No problem. You can add it later with:
        {
          "scripts": {
            "${names.script}": "${scriptCommand}"
          }
        }`,
        { noPrefix: true }
      );
    }
  }

  return exitCode;
}

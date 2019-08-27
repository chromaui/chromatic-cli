import path from 'path';
import setupDebug from 'debug';
import fs from 'fs-extra';
import * as url from 'url';
import pkgUp from 'pkg-up';
import isUrl from 'is-url';
import { spawn as spawnRun } from 'yarn-or-npm';

import rfs from 'rotating-file-stream';

import GraphQLClient from '../io/GraphQLClient';
import { TesterCreateAppTokenMutation, TesterSkipBuildMutation } from '../io/gql-queries';

import { uploadToS3 } from '../io/upload-to-s3';

import { getCommitAndBranch } from '../git/getCommitAndBranch';
import { getBaselineCommits } from '../git/git';

import getStorybookInfo from '../storybook/get-info';

import log from '../lib/log';
import openTunnel from '../lib/tunnel';

import { CHROMATIC_INDEX_URL } from '../constants';

export const debug = setupDebug('chromatic-cli:test-run');

const createGraphQLClient = async (appCode, sessionId) => {
  debug(`Connecting to index:${CHROMATIC_INDEX_URL}`);

  const client = new GraphQLClient({
    uri: `${CHROMATIC_INDEX_URL}/graphql`,
    headers: { 'x-chromatic-session-id': sessionId },
    retries: 3,
  });

  const { createAppToken } = await client.runQuery(TesterCreateAppTokenMutation, {
    appCode,
  });

  client.headers = { ...client.headers, Authorization: `Bearer ${createAppToken}` };

  return client;
};

const createGitInfo = async (client, options) => {
  const current = await getCommitAndBranch();

  const ignoreLastBuildOnBranch =
    typeof options.ignoreLastBuildOnBranch === 'string'
      ? options.ignoreLastBuildOnBranch === current.branch
      : options.ignoreLastBuildOnBranch;

  const base = await getBaselineCommits(client, {
    branch: current.branch,
    ignoreLastBuildOnBranch,
  });

  debug(`Found current branch: ${current.branch}`);
  debug(`Found current commit: ${current.commit}`);
  debug(`Found base commit: ${base}`);

  return { current, base };
};

const runScript = name => {
  let resolved = false;
  let exited = false;
  return new Promise((res, rej) => {
    let out;
    const streamHandler = d => {
      if (!out) {
        const str = d.toString();
        const [, foundUrl] = str.match(/Storybook.*started.*?(https?:\/\/[^\s]*)/) || [];
        if (foundUrl) {
          out = foundUrl;
        }

        const [, foundOutputDir] = str.match(/Output directory: (.*)/) || [];
        if (foundOutputDir) {
          out = foundOutputDir;
        }

        const found = foundUrl || foundOutputDir;

        if (found && !resolved) {
          res({ out, cleanup });
          resolved = true;
        }
      }
    };

    const cleanup = () => (exited ? child.kill() : undefined);

    const child = spawnRun(['run', name]);
    child.on('exit', code => {
      exited = true;
      if (code === 0) {
        if (out && !resolved) {
          res({ out, cleanup });
        } else if (!out)
          rej(new Error(`succesfully run ${name} but it did not return a url or path`));
      } else {
        rej(new Error(`script ${name} exited with code: ${code}`));
      }
    });

    child.stdout.on('data', streamHandler);
    child.stderr.on('data', streamHandler);

    const logStream = rfs(path.join(process.cwd(), 'chromatic-builder.log'), {
      size: '1M',
      interval: '1d',
    });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
  });
};

const createVersionInfo = async () => {
  const [chromaticInfo, storybookInfo] = await Promise.all([
    createPackageInfo(),
    getStorybookInfo(),
  ]);

  debug(
    `Detected package version:${chromaticInfo.version}, storybook version:${storybookInfo.version}, view layer: ${storybookInfo.viewLayer}`
  );

  return [chromaticInfo, storybookInfo];
};

const createPackageInfo = async () => {
  return pkgUp(__dirname)
    .then(l => fs.readFile(l, 'utf8'))
    .then(s => JSON.parse(s));
};

const dealWith = {
  async script(source, ...rest) {
    log.info('Building your storybook');

    const runResult = await runScript(source);
    debug(`completed running script ${source}`);

    const outType = await detectSourceType(runResult.out);
    debug(`detected output type: "${outType}" of "${runResult.out}"`);

    switch (outType) {
      case 'url': {
        const tunnelResult = await dealWith.url(runResult.out, ...rest);

        return {
          out: tunnelResult.out,
          cleanup: [].concat(runResult.cleanup).concat(tunnelResult.cleanup),
        };
      }
      case 'path': {
        const uploadResult = await dealWith.directory(runResult.out, ...rest);

        return {
          out: uploadResult.out,
          cleanup: [].concat(runResult.cleanup).concat(uploadResult.cleanup),
        };
      }
      default: {
        throw new Error(`after running ${source}, no url or path was found`);
      }
    }
  },
  async directory(source, client) {
    log.info('Uploading your storybook');

    return {
      out: await uploadToS3(source, client),
      cleanup: [],
    };
  },
  async url(source, client) {
    log.info(`Connecting to ${source}`);
    const { port, hostname, protocol } = url.parse(source);
    const tunnelResult = await openTunnel({
      local_port: port,
      local_host: hostname,
      local_http: protocol === 'https',
    });

    return {
      out: await uploadToS3(source, client),
      cleanup: [],
    };
  },
  async command(source, client) {
    // eslint-disable-next-line no-console
    console.log('not yet implemented');
  },
};

const prepareSource = async (source, ...rest) => {
  const sourceType = await detectSourceType(source);
  debug(`preparing source (${sourceType}): "${source}"`);

  switch (sourceType) {
    case 'script': {
      return dealWith.script(source, ...rest);
    }
    case 'path': {
      return dealWith.directory(source, ...rest);
    }
    case 'url': {
      return dealWith.url(source, ...rest);
    }
    case 'command': {
      return dealWith.command(source, ...rest);
    }
    default: {
      throw new Error(`Could not determine what to do with (${sourceType}) ${source}`);
    }
  }
};

const npmScriptExists = async name => {
  return new Promise((res, rej) => {
    const out = {};
    const child = spawnRun(['run', '--json']);
    child.on('exit', code => {
      if (code === 0) {
        res(!!out[name]);
      } else {
        rej(new Error(`attempted to retrieve list of (npm) script exited with code: ${code}`));
      }
    });
    child.stdout.on('data', d => {
      try {
        const json = JSON.parse(d.toString());

        // yarn & npm return a different interface
        Object.assign(out, json.data && json.data.hints ? json.data.hints : json);
      } catch (e) {
        // ignore
      }
    });
  });
};

const isValidPath = async l => {
  const found = await fs.stat(l).catch(() => {});

  if (found) {
    return found.isDirectory();
  }
  return false;
};

const detectSourceType = async config => {
  if (isUrl(config)) {
    return 'url';
  }

  if (await isValidPath(config)) {
    return 'path';
  }

  if (await npmScriptExists(config)) {
    return 'script';
  }

  return 'command';
};

export async function run(appCode, source, options) {
  const client = await createGraphQLClient(appCode, options.sessionId);
  const [chromaticInfo, storybookInfo] = await createVersionInfo();

  const git = await createGitInfo(client, options);

  // skip the entire build?
  if (options.skip) {
    const result = await client.runQuery(TesterSkipBuildMutation, { commit: git.commit });
    if (result) {
      log.info(`Build skipped for commit ${git.commit}`);
    } else {
      throw new Error('Failed to skip build.');
    }
  } else {
    debug(`Creating build with session id: ${options.sessionId}`);
  }

  const autoAcceptChanges =
    typeof options.autoAcceptChanges === 'string'
      ? options.autoAcceptChanges === git.current.branch
      : options.autoAcceptChanges;

  const exitZeroOnChanges =
    typeof options.exitZeroOnChanges === 'string'
      ? options.exitZeroOnChanges === git.current.branch
      : options.exitZeroOnChanges;

  const { out: sourceLocation, cleanup } = await prepareSource(source, client);

  // eslint-disable-next-line no-console
  console.log({ sourceLocation, cleanup });
}

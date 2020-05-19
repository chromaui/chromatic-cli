import { spawn } from 'cross-spawn';
import https from 'https';
import fetch from 'node-fetch';
import path from 'path';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export async function checkResponse(url) {
  try {
    await fetch(url, { agent: url.startsWith('https:') ? httpsAgent : undefined });
    return true;
  } catch (e) {
    return false;
  }
}

async function waitForResponse(child, url, env) {
  const timeoutAt = Date.now() + env.CHROMATIC_TIMEOUT;
  return new Promise((resolve, reject) => {
    let resolved = false;
    async function check() {
      if (Date.now() > timeoutAt) {
        resolved = true;
        reject(
          new Error(
            `No server responding at ${url} within ${env.CHROMATIC_TIMEOUT / 1000} seconds.`
          )
        );
        return;
      }

      if (await checkResponse(url)) {
        resolved = true;
        resolve();
        return;
      }
      setTimeout(check, env.CHROMATIC_POLL_INTERVAL);
    }
    check();

    if (child) {
      let output = '';
      child.stderr.on('data', e => {
        output += e.toString();
      });
      child.stdout.on('data', o => {
        output += o.toString();
      });

      child.on('close', () => {
        if (!resolved) {
          reject(new Error(`Script failed to start: ${output}\n`));
        }
      });
    }
  });
}

export default async function startApp({
  scriptName,
  commandName,
  args,
  url,
  options = { stdio: 'inherit' },
  env,
}) {
  let child;
  if (scriptName) {
    if (await checkResponse(url)) {
      // We assume the process that is already running on the url is indeed our Storybook
      return null;
    }

    // Run either:
    //   npm/yarn run scriptName (depending on npm_execpath)
    //   node path/to/npm.js run scriptName (if npm run via node)
    // This technique lifted from https://github.com/mysticatea/npm-run-all/blob/52eaf86242ba408dedd015f53ca7ca368f25a026/lib/run-task.js#L156-L174
    const npmPath = process.env.npm_execpath;
    const npmPathIsJs = typeof npmPath === 'string' && /\.m?js/.test(path.extname(npmPath));
    const execPath = npmPathIsJs ? process.execPath : npmPath || 'npm';
    const spawnArgs = npmPathIsJs ? [npmPath] : [];

    spawnArgs.push('run', scriptName, ...args);
    child = spawn(execPath, spawnArgs, { cwd: process.cwd(), env: process.env, ...options });
  } else if (commandName) {
    child = spawn(commandName, { env: process.env, shell: true });
  } else {
    throw new Error('You must pass --script-name or --exec');
  }

  if (url) {
    await waitForResponse(child, url, env);
  }

  return child;
}

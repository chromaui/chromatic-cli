import { spawn } from 'cross-spawn';
import path from 'path';

export async function checkResponse(ctx, url) {
  try {
    // Allow invalid certificates, because we're running against localhost
    await ctx.http.fetch(url, {}, { proxy: { rejectUnauthorized: false } });
    return true;
  } catch (e) {
    return false;
  }
}

async function waitForResponse(ctx, child, url) {
  const timeoutAt = Date.now() + ctx.env.CHROMATIC_TIMEOUT;
  return new Promise((resolve, reject) => {
    let resolved = false;
    async function check() {
      if (Date.now() > timeoutAt) {
        resolved = true;
        reject(
          new Error(
            `No server responding at ${url} within ${ctx.env.CHROMATIC_TIMEOUT / 1000} seconds.`
          )
        );
        return;
      }

      if (await checkResponse(ctx, url)) {
        resolved = true;
        resolve();
        return;
      }
      setTimeout(check, ctx.env.CHROMATIC_POLL_INTERVAL);
    }
    check();

    if (child) {
      let output = '';
      child.stderr.on('data', (e) => {
        output += e.toString();
      });
      child.stdout.on('data', (o) => {
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
  ctx,
  scriptName,
  commandName,
  args,
  url,
  options = { stdio: 'inherit' },
}) {
  let child;
  if (scriptName) {
    if (await checkResponse(ctx, url)) {
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
    await waitForResponse(ctx, child, url);
  }

  return child;
}

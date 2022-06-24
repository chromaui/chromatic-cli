import { SpawnOptions } from 'child_process';
import { spawn } from 'cross-spawn';
import path from 'path';
import { Context } from '../types';

export async function resolveIsolatorUrl(ctx: Context, storybookUrl: string) {
  try {
    // Allow invalid certificates, because we might be running against localhost.
    const options = { proxy: { rejectUnauthorized: false } };
    const { url: resolvedUrl } = await ctx.http.fetch(storybookUrl, {}, options);
    const isolatorUrl = resolvedUrl.replace(/index\.html$/, '').replace(/\/?$/, '/iframe.html');
    await ctx.http.fetch(isolatorUrl, {}, options);
    return isolatorUrl;
  } catch (e) {
    return false;
  }
}

async function waitForResponse(ctx: Context, child: ReturnType<typeof spawn>, url: string) {
  const timeoutAt = Date.now() + ctx.env.CHROMATIC_TIMEOUT;
  return new Promise<string>((resolve, reject) => {
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

      const isolatorUrl = await resolveIsolatorUrl(ctx, url);
      if (isolatorUrl) {
        resolved = true;
        resolve(isolatorUrl);
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

export default async function startApp(
  ctx: Context,
  { args, options = { stdio: 'inherit' } }: { args: string[]; options: SpawnOptions }
) {
  let child: ReturnType<typeof spawn>;
  if (ctx.options.scriptName) {
    if (await resolveIsolatorUrl(ctx, ctx.options.url)) {
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

    spawnArgs.push('run', ctx.options.scriptName, ...args);
    child = spawn(execPath, spawnArgs, { cwd: process.cwd(), env: process.env, ...options });
  } else if (ctx.options.exec) {
    child = spawn(ctx.options.exec, { env: process.env, shell: true });
  } else {
    throw new Error('You must pass --script-name or --exec');
  }

  if (ctx.options.url) {
    ctx.isolatorUrl = await waitForResponse(ctx, child, ctx.options.url);
  }

  return child;
}

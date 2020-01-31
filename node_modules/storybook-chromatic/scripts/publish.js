#!/usr/bin/env node -r esm

import { spawn } from 'cross-spawn';
import pkgUp from 'pkg-up';
import { readFile, writeFile } from 'jsonfile';
import dedent from 'ts-dedent';
import chalk from 'chalk';

const remainingFlags = process.argv.slice(2);

const targets = ['storybook-chromatic', 'storybook-chroma'];

const exec = (args, { pipe } = {}) => {
  return new Promise((res, rej) => {
    let output = '';
    const child = spawn('npm', args);
    const streamHandler = d => {
      output += d.toString();
    };
    child.on('exit', code => {
      if (code === 0) {
        res(output);
      } else {
        rej(new Error(`${args.join(' ')} exited with code: ${code}`));
      }
    });

    if (pipe) {
      child.stdin.pipe(process.stdin);
      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
    } else {
      child.stdout.on('data', streamHandler);
      child.stderr.on('data', streamHandler);
    }
  });
};

const packageJson = {
  async read() {
    return pkgUp(__dirname).then(l => readFile(l));
  },
  async write(json) {
    return pkgUp(__dirname).then(l => writeFile(l, json, { spaces: 2 }));
  },
};

const publishAs = async name => {
  const initial = await packageJson.read();

  try {
    const temp = { ...initial, name };
    await packageJson.write(temp);
    await exec(['publish', ...remainingFlags], { pipe: true });
  } catch (e) {
    //
  } finally {
    await packageJson.write(initial);
  }
};

const check = {
  async publishable(name, version) {
    const text = await exec(['info', name, '--json', '--silent']);

    const json = JSON.parse(text);

    const { versions } = json.data ? json.data : json;

    return !versions.find(v => v === version);
  },

  async allowed(name) {
    const user = (await exec(['whoami', '--silent'])).trim();
    const owners = JSON.parse(
      await exec(['access', 'ls-collaborators', name, '--json', '--silent'])
    );

    return !!Object.entries(owners).find(
      ([useName, permissions]) => useName.match(user) && permissions.includes('write')
    );
  },
};

const getUnpublishable = async list => {
  const { version } = await packageJson.read();

  return (
    await Promise.all(
      list.map(async name => {
        const versionOk = await check.publishable(name, version);
        const ownershipOk = await check.allowed(name);

        if (versionOk && ownershipOk) {
          return false;
        }

        return { name, reason: versionOk ? 'ownership' : 'version' };
      })
    )
  ).reduce((acc, item) => acc.concat(item || []), []);
};

const run = async list => {
  const unpublishable = await getUnpublishable(list);

  if (unpublishable.length === 0) {
    targets.reduce(async (acc, item) => {
      await acc;

      await publishAs(item);
    }, Promise.resolve());
  } else {
    console.log(dedent`
      ${chalk.red('These packages cannot be published:')}
      
      ${unpublishable
        .map(
          ({ name, reason }) =>
            `${chalk.blue(name)} could not be published because of a ${chalk.bold(reason)} problem`
        )
        .join('\n')}
      
      You may lack the required permissions on npm OR the version you're trying to publish already exists,
      Upgrade the version or ask permission from current owners
    `);
    process.exitCode = 1;
  }
};

run(targets);

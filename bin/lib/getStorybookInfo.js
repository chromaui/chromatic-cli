// Figure out the Storybook version and view layer

import fs from 'fs-extra';
import meow from 'meow';
import argv from 'string-argv';
import semver from 'semver';

import noViewLayerDependency from '../ui/messages/errors/noViewLayerDependency';
import noViewLayerPackage from '../ui/messages/errors/noViewLayerPackage';

const viewLayers = {
  '@storybook/react': 'react',
  '@storybook/vue': 'vue',
  '@storybook/vue3': 'vue3',
  '@storybook/angular': 'angular',
  '@storybook/html': 'html',
  '@storybook/web-components': 'web-components',
  '@storybook/polymer': 'polymer',
  '@storybook/ember': 'ember',
  '@storybook/marko': 'marko',
  '@storybook/mithril': 'mithril',
  '@storybook/riot': 'riot',
  '@storybook/svelte': 'svelte',
  '@storybook/preact': 'preact',
  '@storybook/rax': 'rax',
  '@web/dev-server-storybook': 'web-components',
};

const supportedAddons = {
  '@storybook/addon-a11y': 'a11y',
  '@storybook/addon-actions': 'actions',
  '@storybook/addon-backgrounds': 'backgrounds',
  '@storybook/addon-centered': 'centered',
  '@storybook/addon-contexts': 'contexts',
  '@storybook/addon-cssresources': 'cssresources',
  '@storybook/addon-design-assets': 'design-assets',
  '@storybook/addon-docs': 'docs',
  '@storybook/addon-events': 'events',
  '@storybook/addon-google-analytics': 'google-analytics',
  '@storybook/addon-graphql': 'graphql',
  '@storybook/addon-info': 'info',
  '@storybook/addon-jest': 'jest',
  '@storybook/addon-knobs': 'knobs',
  '@storybook/addon-links': 'links',
  '@storybook/addon-notes': 'notes',
  '@storybook/addon-ondevice-actions': 'ondevice-actions',
  '@storybook/addon-ondevice-backgrounds': 'ondevice-backgrounds',
  '@storybook/addon-ondevice-knobs': 'ondevice-knobs',
  '@storybook/addon-ondevice-notes': 'ondevice-notes',
  '@storybook/addon-options': 'options',
  '@storybook/addon-queryparams': 'queryparams',
  '@storybook/addon-storyshots': 'storyshots',
  '@storybook/addon-storysource': 'storysource',
  '@storybook/addon-viewport': 'viewport',
};

const resolve = (pkg) => {
  try {
    const path = require.resolve(`${pkg}/package.json`, { paths: [process.cwd()] });
    return Promise.resolve(path);
  } catch (error) {
    return Promise.reject(error);
  }
};

const timeout = (count) =>
  new Promise((_, rej) => {
    setTimeout(() => rej(new Error('The attempt to find the Storybook version timed out')), count);
  });

const findViewlayer = async ({ env, log, options, packageJson }) => {
  // Allow setting Storybook version via CHROMATIC_STORYBOOK_VERSION='@storybook/react@4.0-alpha.8' for unusual cases
  if (env.CHROMATIC_STORYBOOK_VERSION) {
    const [, p, v] = env.CHROMATIC_STORYBOOK_VERSION.match(/(.+)@(.+)$/) || [];
    const version = semver.valid(v); // ensures we get a specific version, not a range
    if (!p || !version) {
      throw new Error(
        'Invalid CHROMATIC_STORYBOOK_VERSION; expecting something like "@storybook/react@6.2.0".'
      );
    }
    const viewLayer = viewLayers[p] || viewLayers[`@storybook/${p}`];
    if (!viewLayer) {
      throw new Error(`Unsupported viewlayer specified in CHROMATIC_STORYBOOK_VERSION: ${p}`);
    }
    return { version, viewLayer };
  }

  // Pull the viewlayer from dependencies in package.json
  const dep = Object.entries(packageJson.dependencies || {}).find(([p]) => viewLayers[p]);
  const devDep = Object.entries(packageJson.devDependencies || {}).find(([p]) => viewLayers[p]);
  const peerDep = Object.entries(packageJson.peerDependencies || {}).find(([p]) => viewLayers[p]);
  const dependency = dep || devDep || peerDep;

  if (!dependency) {
    throw new Error(noViewLayerDependency());
  }
  if (dep && devDep && dep[0] === devDep[0]) {
    log.warn(
      `Found "${dep[0]}" in both "dependencies" and "devDependencies". This is probably a mistake.`
    );
  }
  if (dep && peerDep && dep[0] === peerDep[0]) {
    log.warn(
      `Found "${dep[0]}" in both "dependencies" and "peerDependencies". This is probably a mistake.`
    );
  }

  const [pkg, version] = dependency;
  const viewLayer = pkg.replace('@storybook/', '');

  // If we won't need the Storybook CLI, we can exit early
  // Note that `version` can be a semver range in this case.
  if (options.storybookBuildDir) return { viewLayer, version };

  // Try to find the viewlayer package in node_modules so we know it's installed
  return Promise.race([
    resolve(pkg)
      .then(fs.readJson)
      .then((json) => ({ viewLayer, version: json.version }))
      .catch(() => Promise.reject(new Error(noViewLayerPackage(pkg)))),
    timeout(10000),
  ]);
};

const findAddons = async () => {
  const result = await Promise.all(
    Object.entries(supportedAddons).map(([pkg, name]) =>
      resolve(pkg)
        .then(fs.readJson, () => false)
        .then((pkgJson) => ({ name, packageName: pkgJson.name, packageVersion: pkgJson.version }))
    )
  );

  return { addons: result.filter(Boolean) };
};

const findConfigFlags = async ({ options, packageJson }) => {
  const { scripts = {} } = packageJson;
  if (!options.buildScriptName || !scripts[options.buildScriptName]) return {};

  const { flags } = meow({
    argv: argv(scripts[options.buildScriptName]),
    flags: {
      configDir: { type: 'string', alias: 'c' },
      staticDir: { type: 'string', alias: 's' },
    },
  });

  return {
    configDir: flags.configDir,
    staticDir: flags.staticDir && flags.staticDir.split(','),
  };
};

export default async function getStorybookInfo(ctx) {
  const info = await Promise.all([findAddons(), findConfigFlags(ctx), findViewlayer(ctx)]);
  return info.reduce((acc, obj) => Object.assign(acc, obj), {});
}

import fs from 'fs-extra';
import meow from 'meow';
import argv from 'string-argv';
import semver from 'semver';

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
  '@storybook/addon-essentials': 'essentials',
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

const resolvePackageJson = (pkg) => {
  try {
    const path = require.resolve(`${pkg}/package.json`, { paths: [process.cwd()] });
    return fs.readJson(path);
  } catch (error) {
    return Promise.reject(error);
  }
};

// Double inversion on Promise.all means fulfilling with the first fulfilled promise, or rejecting
// when _everything_ rejects. This is different from Promise.race, which immediately rejects on the
// first rejection.
const invert = (promise) => new Promise((resolve, reject) => promise.then(reject, resolve));
const raceFulfilled = (promises) => invert(Promise.all(promises.map(invert)).then((arr) => arr[0]));

const timeout = (count) =>
  new Promise((_, rej) => {
    setTimeout(() => rej(new Error('Timeout while resolving Storybook view layer package')), count);
  });

const findDependency = ({ dependencies, devDependencies, peerDependencies }, predicate) => [
  Object.entries(dependencies || {}).find(predicate),
  Object.entries(devDependencies || {}).find(predicate),
  Object.entries(peerDependencies || {}).find(predicate),
];

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
  const [dep, devDep, peerDep] = findDependency(packageJson, ([key]) => viewLayers[key]);
  const [pkg, version] = dep || devDep || peerDep || [];
  const viewLayer = viewLayers[pkg];

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

  if (viewLayer) {
    if (options.storybookBuildDir) {
      // If we aren't going to invoke the Storybook CLI later, we can exit early.
      // Note that `version` can be a semver range in this case.
      return { viewLayer, version };
    }

    // Verify that the viewlayer package is actually present in node_modules.
    return Promise.race([
      resolvePackageJson(pkg)
        .then((json) => ({ viewLayer, version: json.version }))
        .catch(() => Promise.reject(new Error(noViewLayerPackage(pkg)))),
      timeout(10000),
    ]);
  }

  log.debug(`No viewlayer package listed in dependencies. Checking transitive dependencies.`);

  // We might have a transitive dependency (e.g. through `@nuxtjs/storybook` which depends on
  // `@storybook/vue`). In this case we look for any viewlayer package present in node_modules,
  // and return the first one we find.
  return Promise.race([
    raceFulfilled(
      Object.entries(viewLayers).map(async ([key, value]) => {
        const json = await resolvePackageJson(key);
        return { viewLayer: value, version: json.version };
      })
    ).catch(() => Promise.reject(new Error(noViewLayerPackage(pkg)))),
    timeout(10000),
  ]);
};

const findAddons = async ({ packageJson }) => ({
  addons: Object.entries(supportedAddons)
    .map(([pkg, name]) => {
      const [dep, devDep, peerDep] = findDependency(packageJson, ([key]) => key === pkg);
      const [packageName, packageVersion] = dep || devDep || peerDep || [];
      return packageName && packageVersion && { name, packageName, packageVersion };
    })
    .filter(Boolean),
});

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
  const info = await Promise.all([findAddons(ctx), findConfigFlags(ctx), findViewlayer(ctx)]);
  return info.reduce((acc, obj) => Object.assign(acc, obj), {});
}

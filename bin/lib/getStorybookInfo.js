// Figure out the Storybook version and view layer

import fs from 'fs-extra';
import semver from 'semver';

const viewLayers = [
  'react',
  'vue',
  'vue3',
  'angular',
  'html',
  'web-components',
  'polymer',
  'ember',
  'marko',
  'mithril',
  'riot',
  'svelte',
  'preact',
  'rax',
];

const supportedAddons = [
  'a11y',
  'actions',
  'backgrounds',
  'centered',
  'contexts',
  'cssresources',
  'design-assets',
  'docs',
  'events',
  'google-analytics',
  'graphql',
  'info',
  'jest',
  'knobs',
  'links',
  'notes',
  'ondevice-actions',
  'ondevice-backgrounds',
  'ondevice-knobs',
  'ondevice-notes',
  'options',
  'queryparams',
  'storyshots',
  'storysource',
  'viewport',
];

const resolve = (name) => {
  try {
    const path = require.resolve(`@storybook/${name}/package.json`, { paths: [process.cwd()] });
    return Promise.resolve(path);
  } catch (error) {
    return Promise.reject(error);
  }
};

const read = async (filepath) => JSON.parse(await fs.readFile(filepath, 'utf8'));

const timeout = (count) =>
  new Promise((_, rej) => {
    setTimeout(() => rej(new Error('The attempt to find the Storybook version timed out')), count);
  });

const neverResolve = new Promise(() => {});
const disregard = () => neverResolve;

const findViewlayer = async ({ env, log, options, packageJson }) => {
  // Allow setting Storybook version via CHROMATIC_STORYBOOK_VERSION='@storybook/react@4.0-alpha.8' for unusual cases
  if (env.CHROMATIC_STORYBOOK_VERSION) {
    const [viewLayer, v] = env.CHROMATIC_STORYBOOK_VERSION.replace('@storybook/', '').split('@');
    const version = semver.valid(v);
    if (!viewLayer || !version) {
      throw new Error(
        'Invalid CHROMATIC_STORYBOOK_VERSION; expecting something like "@storybook/react@6.2.0".'
      );
    }
    if (!viewLayers.includes(viewLayer)) {
      throw new Error(
        `Unsupported viewlayer specified in CHROMATIC_STORYBOOK_VERSION: ${viewLayer}`
      );
    }
    return { viewLayer, version };
  }

  // Pull the viewlayer from dependencies in package.json
  const dep = Object.entries(packageJson.dependencies || {}).find(([pkg]) =>
    viewLayers.some((viewLayer) => pkg === `@storybook/${viewLayer}`)
  );
  const devDep = Object.entries(packageJson.devDependencies || {}).find(([pkg]) =>
    viewLayers.some((viewLayer) => pkg === `@storybook/${viewLayer}`)
  );
  const peerDep = Object.entries(packageJson.peerDependencies || {}).find(([pkg]) =>
    viewLayers.some((viewLayer) => pkg === `@storybook/${viewLayer}`)
  );
  const dependency = dep || devDep || peerDep;

  if (!dependency) {
    throw new Error(
      'Could not find a supported Storybook viewlayer package in your package.json dependencies. Make sure one is installed.'
    );
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
  const findings = viewLayers.map((v) => resolve(v));
  const rejectedFindings = findings.map((p) => p.then(disregard, () => true));
  const allFailed = Promise.all(rejectedFindings).then(() => {
    throw new Error(
      'Could not find a supported Storybook viewlayer package in node_modules. Make sure one is installed.'
    );
  });

  return Promise.race([
    ...findings.map((p, i) =>
      p.then(
        (l) => read(l).then((r) => ({ viewLayer: viewLayers[i], version: r.version })),
        disregard // keep it pending forever
      )
    ),
    allFailed,
    timeout(10000),
  ]);
};

const findAddons = async () => {
  const result = await Promise.all(
    supportedAddons.map((name) =>
      resolve(`addon-${name}`)
        .then((l) =>
          read(l).then((r) => ({ name, packageName: r.name, packageVersion: r.version }))
        )
        .catch((e) => false)
    )
  );

  return { addons: result.filter(Boolean) };
};

export default async function getStorybookInfo(ctx) {
  const storybookInfo = await findViewlayer(ctx);
  const addonInfo = await findAddons();

  return {
    ...storybookInfo,
    ...addonInfo,
  };
}

/* eslint-disable @typescript-eslint/no-empty-function */
// Figure out the Storybook version and view layer

import fs from 'fs-extra';

const viewLayers = [
  'react',
  'vue',
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

const resolve = name => {
  try {
    const path = require.resolve(`@storybook/${name}/package.json`, { paths: [process.cwd()] });
    return Promise.resolve(path);
  } catch (error) {
    return Promise.reject(error);
  }
};

const read = async filepath => JSON.parse(await fs.readFile(filepath, 'utf8'));

const timeout = count =>
  new Promise((_, rej) => {
    setTimeout(() => rej(new Error('The attempt to find the Storybook version timed out')), count);
  });

const neverResolve = new Promise(() => {});
const disregard = () => neverResolve;

const findViewlayer = async ({ env }) => {
  // Allow setting Storybook version via CHROMATIC_STORYBOOK_VERSION='react@4.0-alpha.8' for unusual cases
  if (env.CHROMATIC_STORYBOOK_VERSION) {
    const [viewLayer, storybookVersion] = env.CHROMATIC_STORYBOOK_VERSION.split('@');
    if (!viewLayer || !storybookVersion) {
      throw new Error('CHROMATIC_STORYBOOK_VERSION was provided but could not be used');
    }
    return { viewLayer, storybookVersion };
  }

  // Try to find the Storybook viewlayer package
  const findings = viewLayers.map(v => resolve(v));
  const rejectedFindings = findings.map(p => p.then(disregard, () => true));
  const allFailed = Promise.all(rejectedFindings).then(() => {
    throw new Error(
      'Could not find a supported Storybook viewlayer package. Make sure one is installed.'
    );
  });

  return Promise.race([
    ...findings.map((p, i) =>
      p.then(
        l => read(l).then(r => ({ viewLayer: viewLayers[i], ...r })),
        disregard // keep it pending forever
      )
    ),
    allFailed,
    timeout(10000),
  ]);
};

const findAddons = async () => {
  const result = await Promise.all(
    supportedAddons.map(name =>
      resolve(`addon-${name}`)
        .then(l => read(l).then(r => ({ name, packageName: r.name, packageVersion: r.version })))
        .catch(e => false)
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

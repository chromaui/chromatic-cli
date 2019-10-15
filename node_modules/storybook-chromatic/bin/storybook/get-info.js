// Figure out the Storybook version and view layer

import fs from 'fs-extra';
import resolve from 'enhanced-resolve';
import { CHROMATIC_STORYBOOK_VERSION } from '../constants';

const viewLayers = [
  'react',
  'vue',
  'angular',
  'html',
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

const find = name =>
  new Promise((res, rej) => {
    resolve(process.cwd(), `@storybook/${name}/package.json`, (err, results) => {
      if (err) {
        rej(err);
      } else {
        res(results);
      }
    });
  });

const read = async l => {
  const result = await fs.readFile(l, 'utf8');

  return JSON.parse(result);
};

const timeout = count =>
  new Promise((_, rej) => {
    setTimeout(() => rej(new Error('The attempt to find the storybook version timed out')), count);
  });

const disregard = () => neverResolve;
const neverResolve = new Promise(() => {});

const findViewlayer = async () => {
  // Allow setting Storybook version via CHROMATIC_STORYBOOK_VERSION='react@4.0-alpha.8' for unusual cases
  if (CHROMATIC_STORYBOOK_VERSION) {
    const [viewLayer, storybookVersion] = CHROMATIC_STORYBOOK_VERSION.split('@');
    if (!viewLayer || !storybookVersion) {
      throw new Error('CHROMATIC_STORYBOOK_VERSION was provided but could not be used');
    }
    return { viewLayer, storybookVersion };
  }

  // Try to find the
  const findings = viewLayers.map(v => find(v));
  const rejectedFindings = findings.map(p => p.then(disregard, () => true));
  const allFailed = Promise.all(rejectedFindings).then(() => {
    throw new Error(
      'Could not discover Storybook version. Try upgrading the chromatic-cli package?'
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
      find(`addon-${name}`)
        .then(l => read(l).then(r => ({ name, packageName: r.name, packageVersion: r.version })))
        .catch(e => false)
    )
  );

  return { addons: result.filter(Boolean) };
};

export default async function getStorybookInfo() {
  const storybookInfo = await findViewlayer();
  const addonInfo = await findAddons();

  return {
    ...storybookInfo,
    ...addonInfo,
  };
}

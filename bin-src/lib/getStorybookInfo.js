import fs from 'fs-extra';
import meow from 'meow';
import { parseArgsStringToArgv } from 'string-argv';
import semver from 'semver';
import noViewLayerPackage from '../ui/messages/errors/noViewLayerPackage';
import { viewLayers } from './viewLayers';
import { supportedAddons } from './supportedAddons';
import { timeout, raceFulfilled } from './promises';

const resolvePackageJson = (pkg) => {
  try {
    // we bundle this app for node, meaning all require calls are replaced by webpack.
    // in this case we want to use node's actual require functionality!
    // webpack will provide a '__non_webpack_require__' function to do this with,
    // but this will obviously not be present during tests, hence the check and fallback to the normal require
    // eslint-disable-next-line no-undef
    const r = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
    const path = r.resolve(`${pkg}/package.json`);
    return fs.readJson(path);
  } catch (error) {
    return Promise.reject(error);
  }
};

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
    argv: parseArgsStringToArgv(scripts[options.buildScriptName]),
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
  let result;
  if (!result) {
    try {
      const info = await Promise.all([findAddons(ctx), findConfigFlags(ctx), findViewlayer(ctx)]);
      result = info.reduce((acc, obj) => Object.assign(acc, obj), {});
    } catch (e) {
      //
    }
  }
  if (!result) {
    result = {
      viewLayer: null,
      version: null,
      addons: [],
    };
  }
  return result;
}

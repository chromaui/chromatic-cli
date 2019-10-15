const fs = require('fs');
const path = require('path');
const crossSpawn = require('cross-spawn');
const pkgDir = require('pkg-dir');

let cachedHasYarn;
let cachedHasNPM;
let cachedClient;

function clearCache() {
  cachedHasYarn = undefined;
  cachedHasNPM = undefined;
  cachedClient = undefined;
}

function hasYarn() {
  if (cachedHasYarn !== undefined) return cachedHasYarn;

  try {
    const cmd = crossSpawn.sync('yarn', ['--version']);
    const version = cmd.stdout && cmd.stdout.toString().trim();
    cachedHasYarn = !!version;
  } catch (e) {
    cachedHasYarn = false;
  }

  return cachedHasYarn;
}

function hasNpm() {
  if (cachedHasNPM !== undefined) return cachedHasNPM;

  try {
    const cmd = crossSpawn.sync('npm', ['--version']);
    const version = cmd.stdout && cmd.stdout.toString().trim();
    cachedHasNPM = !!version;
  } catch (e) {
    cachedHasNPM = false;
  }

  return cachedHasNPM;
}

function yarnOrNpm() {
  if (cachedClient !== undefined) return cachedClient;

  const pkgRoot = pkgDir.sync();

  if (pkgRoot) {
    const pkgLockPath = path.join(pkgRoot, 'package-lock.json');
    const yarnLockPath = path.join(pkgRoot, 'yarn.lock');

    try {
      fs.statSync(yarnLockPath);
      cachedClient = 'yarn';
      return cachedClient;
    } catch (e) {}

    try {
      fs.statSync(pkgLockPath);
      cachedClient = 'npm';
      return cachedClient;
    } catch (e) {}
  }

  return hasYarn() ? 'yarn' : 'npm';
}

function spawn(...args) {
  args.unshift(yarnOrNpm());
  return crossSpawn(...args);
}

function spawnSync(...args) {
  args.unshift(yarnOrNpm());
  return crossSpawn.sync(...args);
}

yarnOrNpm.hasYarn = hasYarn;
yarnOrNpm.hasNpm = hasNpm;
yarnOrNpm.spawn = spawn;
yarnOrNpm.spawn.sync = spawnSync;
yarnOrNpm.clearCache = clearCache;

module.exports = yarnOrNpm;

#!/usr/bin/env node

import { $ } from 'execa';

import { main as publishAction } from './publishAction.mjs';

async function main() {
  const { stdout: status } = await $`git status --porcelain`;
  if (status) {
    console.error(`❗️ Working directory is not clean:\n${status}`);
    return;
  }

  const { stdout: nextVersion } = await $`auto shipit --dry-run --quiet`;

  await build(nextVersion);
  await $({ stdout: 'inherit', stderr: 'inherit' })`auto shipit`;

  if (process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/main') {
    await publishAction('latest');
  } else {
    console.info(`📌 Temporarily bumping version to '${nextVersion}' for canary release`);
    await $`npm --no-git-tag-version version ${nextVersion}`;
    publishAction('canary');
    console.info('🧹 Resetting changes');
    await $`git reset --hard`;
  }
}

async function build(nextVersion) {
  console.info(`📌 Temporarily bumping version to '${nextVersion}' for build step`);
  await $`npm --no-git-tag-version version ${nextVersion}`;

  console.info('📦 Building with new version');
  await $({
    stdio: 'inherit',
    env: {
      ...process.env,
      SENTRY_RELEASE: nextVersion,
    },
  })`yarn build`;

  console.info('🧹 Resetting changes to let `auto` do its thing');
  await $`git reset --hard`;

  console.info('🌐 Sending sourcemaps to Sentry');
  await $({ stdout: 'inherit', stderr: 'inherit' })`sentry-cli sourcemaps inject dist action`;
  await $({
    stdout: 'inherit',
    stderr: 'inherit',
  })`sentry-cli sourcemaps upload --release=${nextVersion} --dist=cli dist`;
  await $({
    stdout: 'inherit',
    stderr: 'inherit',
  })`sentry-cli sourcemaps upload --release=${nextVersion} --dist=action action`;

  console.info('🚀 Creating new release in Sentry');
  await $({ stdout: 'inherit', stderr: 'inherit' })`sentry-cli releases new ${nextVersion}`;

  console.info('🔗 Associating commits with release');
  await $({
    stdout: 'inherit',
    stderr: 'inherit',
  })`sentry-cli releases set-commits --auto ${nextVersion} --ignore-missing`;

  console.info('🧹 Removing sourcemaps from build');
  await $`yarn clean:sourcemaps`;

  console.info('✅ Build with new version completed, ready for auto!');
}

main();

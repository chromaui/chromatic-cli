#!/usr/bin/env node

import { $ } from 'execa';

import { main as publishAction } from './publishAction.mjs';

async function main() {
  const { stdout: status } = await $`git status --porcelain`;
  if (status) {
    console.error(`❗️ Working directory is not clean:\n${status}`);
    return;
  }

  await build();
  await publishAction('next');
}

async function build() {
  const { stdout: nextVersion } = await $`auto shipit --dry-run --quiet`;

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

  console.info('✅ Build with new version completed, ready for push to action-next!');
}

main();

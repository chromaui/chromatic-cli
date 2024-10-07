#!/usr/bin/env node

import { $ } from 'execa';

async function main() {
  const { stdout: status } = await $`git status --porcelain`;
  if (status) {
    console.error(`❗️ Working directory is not clean:\n${status}`);
    return;
  }

  const nextVersion = process.env.NEXT_VERSION;
  if (!nextVersion) {
    console.error('❗️ NEXT_VERSION environment variable is required');
    return;
  }

  console.info(`📌 Temporarily bumping version to '${nextVersion}' for build step`);
  await $`npm --no-git-tag-version version ${nextVersion}`;

  console.info('📦 Building with new version');
  await $({ stdio: 'inherit' })`yarn build`;

  console.info('🧹 Resetting changes to let `auto` do its thing');
  await $`git reset --hard`;

  console.info('✅ Build with new version completed');
}

main();

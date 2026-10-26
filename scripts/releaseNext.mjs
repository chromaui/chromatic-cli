#!/usr/bin/env node

import { $ } from 'execa';
import { appendFileSync } from 'fs';

import { main as publishAction } from './publishAction.mjs';

async function main() {
  const { stdout: status } = await $`git status --porcelain`;
  // Throw rather than return, so CI never reaches the smoke test without a published tag.
  if (status) throw new Error(`❗️ Working directory is not clean:\n${status}`);

  await build();
  const tag = await publishAction('next');

  // The smoke test checks out this exact tag. A floating tag like `latest` could point at another
  // merge group's build, since merge groups publish to action-next concurrently.
  if (process.env.GITHUB_OUTPUT) {
    if (!tag) throw new Error('❗️ Publishing to action-next did not produce a tag');
    appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
  }
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

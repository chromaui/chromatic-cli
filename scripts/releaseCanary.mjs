#!/usr/bin/env node

import { $ } from 'execa';
import { appendFileSync, readFileSync } from 'fs';

import { main as publishAction } from './publishAction.mjs';

async function computeNextVersion() {
  if (process.env.GITHUB_EVENT_NAME === 'merge_group') {
    // auto's canary versioning expects a PR number, which the merge-queue context
    // does not provide. Produce a deterministic fallback keyed on the run ID.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const runId = process.env.GITHUB_RUN_ID || 'local';
    return `${pkg.version}--canary.merge.${runId}`;
  }

  const { stdout } = await $`auto shipit --dry-run --quiet`;
  return stdout.trim();
}

async function publishNpmCanary(nextVersion) {
  if (process.env.GITHUB_EVENT_NAME === 'merge_group') {
    await $`npm --no-git-tag-version version ${nextVersion}`;
    await $({
      stdout: 'inherit',
      stderr: 'inherit',
    })`auto canary --force --version ${nextVersion}`;
  } else {
    await $({ stdout: 'inherit', stderr: 'inherit' })`auto shipit`;
  }
}

async function main() {
  const { stdout: status } = await $`git status --porcelain`;
  if (status) {
    console.error(`❗️ Working directory is not clean:\n${status}`);
    process.exit(1);
  }

  const nextVersion = await computeNextVersion();
  console.info(`📌 Computed canary version: ${nextVersion}`);

  await build(nextVersion);

  await publishNpmCanary(nextVersion);

  console.info(`📌 Re-bumping version to '${nextVersion}' for action canary publish`);
  await $`npm --no-git-tag-version version ${nextVersion}`;
  await publishAction('canary');

  console.info('🧹 Resetting changes');
  await $`git reset --hard`;

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${nextVersion}\n`);
    console.info(`📤 Wrote version=${nextVersion} to $GITHUB_OUTPUT`);
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

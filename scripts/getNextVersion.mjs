#!/usr/bin/env node

import { $ } from 'execa';

async function main() {
  const { stdout: status } = await $`git status --porcelain`;
  if (status) {
    console.error(`❗️ Working directory is not clean:\n${status}`);
    return;
  }

  const { stdout: nextVersion } = await $`auto shipit --dry-run --quiet`;

  console.log(nextVersion);
}

main();

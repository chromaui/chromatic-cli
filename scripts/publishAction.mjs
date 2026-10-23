#!/usr/bin/env node

import cpy from 'cpy';
import { $ } from 'execa';
import { readFileSync } from 'fs';
import tmp from 'tmp-promise';

const copy = (globs, ...args) => {
  console.info(`📦 Copying:\n   - ${globs.join('\n   - ')}`);
  return cpy(globs, ...args);
};

const PUSH_ATTEMPTS = 5;

// A push loses the race with a concurrent push in one of two ways. Usually the server sees main has
// moved and rejects ours as non-fast-forward (`[rejected]`). If both pushes arrive at almost the
// same moment, ours passes that check but fails to lock main (`[remote rejected] ... cannot lock
// ref`). Every other server-side rejection is a real failure and must not be retried.
const lostPushRace = (stderr = '') =>
  stderr.includes('[rejected]') || /\[remote rejected].*\(cannot lock ref/.test(stderr);

// Retries a push that lost a race with another run's push. `prepareRetry` runs before each retry.
const pushRetryingLostRace = async (label, push, prepareRetry = async () => {}) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await push();
    } catch (error) {
      if (attempt >= PUSH_ATTEMPTS || !lostPushRace(error.stderr)) throw error;
      console.info(
        `⚠️ Push of ${label} was rejected (attempt ${attempt}/${PUSH_ATTEMPTS}). Retrying.`
      );
      await prepareRetry();
    }
  }
};

// Canary releases from different PRs run concurrently, so another run can push to main between our
// clone and our push. When that happens, recommit our exact tree on top of the new main and retry.
// A rebase would be wrong here: it can splice the other run's non-conflicting hunks into our
// bundled files, so the pinned tag would no longer point at what this run built.
const pushToMain = ($$, version) =>
  pushRetryingLostRace(
    'main',
    () => $$`git push origin HEAD:main`,
    async () => {
      await $$`git fetch origin main`;
      await $$`git reset --soft FETCH_HEAD`;
      await $$`git commit --allow-empty -m v${version}`;
    }
  );

// Other runs force-push the same floating tags (`v<major>`, `latest`), so this push can lose the ref
// lock too. Force-pushing again needs no preparation, because each push reads the current tag values.
const pushTags = ($$, version, major) =>
  pushRetryingLostRace(
    'tags',
    () => $$`git push --force origin refs/tags/v${version} refs/tags/v${major} refs/tags/latest`
  );

const publishAction = async ({ major, version, repo }) => {
  const dryRun = process.argv.includes('--dry-run');

  console.info(`🚀 Publishing ${version} to ${repo} ${dryRun ? '(dry run)' : ''}`);

  const { path, cleanup } = await tmp.dir({ unsafeCleanup: true, prefix: `chromatic-action-` });

  // GitHub sometimes redirects the push. After a redirect, git can lose credentials embedded in the
  // remote URL and fall back to an interactive prompt, which fails in CI. A credential helper is
  // consulted whenever git needs credentials, so it survives redirects. It reads GH_TOKEN from the
  // environment so the token never lands in the URL, the git config, or error output.
  // The helper is scoped to https://github.com so a redirect to another host can't receive the
  // token, and the empty `credential.helper` drops inherited helpers so none of them stores it.
  const credentialHelper =
    '!f() { test "$1" = get && echo username=x-access-token && echo "password=$GH_TOKEN"; }; f';
  await $`git clone --config credential.helper= --config credential.https://github.com.helper=${credentialHelper} https://github.com/${repo}.git ${path}`;

  await $`yarn clean-package`;
  await copy(
    ['action/*.cjs', 'action/*.json', 'action.yml', 'package.json', 'CHANGELOG.md'],
    path,
    {
      parents: true, // keep directory structure (i.e. action dir)
      overwrite: true,
    }
  );
  await copy(['action-src/LICENSE', 'action-src/README.md'], path, {
    overwrite: true,
  });
  await copy(['node_modules/semver/**'], path, {
    parents: true,
    overwrite: true,
  });
  await $`yarn clean-package restore`;

  const $$ = (strings, ...args) => {
    console.info(
      // eslint-disable-next-line unicorn/no-array-reduce
      strings.reduce((accumulator, s, index) => `${accumulator}${s}${args[index] || ''}`, '🏃 ')
    );
    return $({ cwd: path })(strings, ...args);
  };

  await $$`git config user.name Chromatic`;
  await $$`git config user.email support@chromatic.com`;
  await $$`git add .`;
  await $$`git commit -m v${version}`;

  if (dryRun) {
    console.info('✅ Skipping git push due to --dry-run');
  } else {
    // Tag only after main is pushed, because a retried push recommits HEAD.
    await pushToMain($$, version);
    await $$`git tag -a v${version} -m ${`v${version} without automatic upgrades (pinned)`}`;
    await $$`git tag -f -a v${major} -m ${`v${version} with automatic upgrades to v${major}.x.x`}`;
    await $$`git tag -f -a latest -m ${`v${version} with automatic upgrades to all versions`}`;
    await pushTags($$, version, major);
    console.info('✅ Done');
  }

  await cleanup();
  return dryRun ? undefined : `v${version}`;
};

export async function main(context) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const version = pkg.version;
  console.info(`📌 Using context arg: ${context}`);
  console.info(`📌 Using package.json version: ${version}`);

  const [, major, minor, patch] = version.match(/^(\d+)\.(\d+)\.(\d+)-*(\w+)?/) || [];
  if (!major || !minor || !patch) {
    console.error(`❗️ Invalid version: ${version}`);
    return;
  }

  switch (context) {
    case 'canary':
      return publishAction({ major, version, repo: 'chromaui/action-canary' });
    case 'next':
      return publishAction({ major, version, repo: 'chromaui/action-next' });
    case 'latest':
      return publishAction({ major, version, repo: 'chromaui/action' });
    default:
      console.error(`❗️ Unknown context: ${context}`);
  }
}

function printHelp() {
  console.info(`
Publish the built GitHub Action (the action/ directory) to one of the
chromaui/action* repos, tagged and pushed with the version from package.json.

Usage:
  yarn publish-action <context> [options]

Arguments:
  context                 Which action repo to publish to. One of:
                            canary   -> chromaui/action-canary
                            next     -> chromaui/action-next
                            latest   -> chromaui/action

Options:
  --dry-run               Do everything except push commits/tags to the remote repo.
  -h, --help              Show this help message and exit.

Environment variables:
  GH_TOKEN                Required. GitHub token used to clone and push to the target action repo.

Examples:
  yarn publish-action canary
  yarn publish-action latest --dry-run

Notes:
  - Build the action (action/ output) before publishing manually.
  - The working directory must be clean (no uncommitted changes) to run this script directly.
`);
}

if (process.argv[1] === import.meta.filename) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (process.env.GH_TOKEN === undefined) {
    console.error(
      `❗️ GH_TOKEN environment variable is required to publish the action. Please set it and try again.`
    );
    process.exit(1);
  }

  const { stdout: status } = await $`git status --porcelain`;
  if (status) {
    console.error(`❗️ Working directory is not clean:\n${status}`);
    process.exit(1);
  }

  // eslint-disable-next-line unicorn/prefer-top-level-await
  main(process.argv[2]);
}

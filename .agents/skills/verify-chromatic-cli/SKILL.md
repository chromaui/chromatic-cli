---
name: verify-chromatic-cli
description: Drive the locally built Chromatic CLI (`chromatic` / `dist/bin.cjs` in chromaui/chromatic-cli) the way a user does from a terminal and capture proof — stdout, stderr, exit codes, written files, TTY output. Use whenever a change touches bin-src/ or node-src/, before calling it done, opening or updating a PR, or reviewing one; for comparing main against a branch; for testing in the e2e fixture projects (Vite, webpack, rsbuild; npm, Yarn 1, Yarn 4 and pnpm monorepos); and for trying a published canary. Covers the main publish command and its option/config preflight, `--only-changed` TurboSnap builds, `trace`, `turbosnap-manifest`, and `trim-stats-file`.
---

# Verify the Chromatic CLI

The product is a Node CLI (`chromatic`, published as the `chromatic` npm package). Users run it in their own JS project. It builds or reads a Storybook, authenticates against the Chromatic backend (`https://index.chromatic.com/graphql`, or `CHROMATIC_INDEX_URL`), uploads, and waits for visual tests. It also ships offline utility subcommands. Here you drive `dist/bin.cjs`, the same bundle npm ships. You never drive `node-src/` directly.

Other surfaces in this repo are not covered here yet: the GitHub Action (`action-src/`, `action.yml`), the React Native commands (`generate-manifest`, `react-native-build`; they need an RN/Expo project), `chromatic init` (it rewrites `package.json` and runs a package install), and the repo's own Storybook (`yarn storybook`, which shows CLI terminal output as stories and is a dev harness, not a user surface).

Everything goes through one helper, `scripts/control-chromatic`, which is executable. Invoke it by path from the repo root:

```bash
S=.agents/skills/verify-chromatic-cli/scripts/control-chromatic
export RUN_ID=my-change-$(date +%s)   # isolates this run's state; pick a fresh one per run
```

## Launch

There is no server to keep alive. "Launch" means: install deps once, build the CLI bundle, and build one Storybook to get a `preview-stats.json` fixture. Each drive is then a separate short-lived process.

```bash
$S setup        # yarn install --immutable, yarn build, yarn build-storybook -o $WORK/storybook-static
eval "$($S env)" # exports REPO WORK EVIDENCE SB_DIR SB_STATS FIXTURE CLI CHECKOUT CHECKOUT_SB_DIR for this RUN_ID
```

Ready means `$S setup` ends with `==> setup done for RUN_ID=…` and `$S doctor` exits 0. A cold `setup` takes a minute or two, mostly install and build.

After you edit source, run `$S rebuild` before driving again. Use `$S rebuild --storybook` if the change affects stories or `.storybook/`. Driving a stale `dist/` proves nothing, and `doctor` fails on it.

Setup facts the helper already handles, so don't reintroduce these mistakes by hand:
- Yarn 4 comes from corepack (`packageManager` field). The helper sets `COREPACK_NPM_REGISTRY=https://registry.npmjs.org`, so corepack does not need `repo.yarnpkg.com`.
- `yarn build-storybook` must have a pipe or TTY on stdin. With stdin=`/dev/null` the build fails with 18× `TypeError: process.stdin.unref is not a function` from `.storybook/clackCapture`. The helper pipes `:` into it.
- The Storybook goes to `$WORK/storybook-static`, never the repo's shared `storybook-static/`, so concurrent runs do not trample each other.

## Doctor

```bash
$S doctor
```

This is read-only. Each line starts with `PASS`, `FAIL` or `INFO`, and the command exits 1 on any `FAIL`. It checks:
- Node >= 22.
- `dist/bin.cjs --version` equals `package.json` version.
- `dist/` is newer than every non-test file in `bin-src/` and `node-src/`.
- This run's `$SB_STATS` exists.
- Whether the backend answers, as INFO. Unreachable is not a failure, because only `publish-build` needs it.
- Whether `CHROMATIC_PROJECT_TOKEN` is set, as INFO. The value is never printed.
- The tmux sessions and throwaway checkout this run owns, and the evidence path.

Run it first, and again whenever output looks wrong.

## Drive

Two drivers, both writing to `$EVIDENCE/<label>/`:

```bash
# Non-interactive (what CI users see). stdin is an empty pipe, so the CLI is non-TTY.
$S run <label> [--cwd DIR] [--cli BUNDLE] -- <chromatic args...>
#   writes command.txt, stdout.txt, stderr.txt, exit_code; prints exit + heads of both streams

# Interactive TTY (clack spinners, interactive rendering). Runs in tmux session vcc-$RUN_ID-<label>
# on its own tmux server (tmux -L vcc-$RUN_ID-<label>), so it gets your shell's environment.
$S tty <label> [--cwd DIR] [--cli BUNDLE] [--timeout SECS] -- <chromatic args...>
#   writes command.txt, pane.txt (full scrollback), exit_code; kills its own session when done

# --cli BUNDLE drives another bin.cjs (from build-ref or install-published) for this drive only.
# A relative path is resolved against your shell's cwd, not --cwd.
```

- `--cwd` defaults to the repo root. Use the repo root (or a fixture's root) for `trace` and `turbosnap-manifest`. `trace` matches changed files relative to the git root, and `turbosnap-manifest` resolves `-s` against its project root (`-b`, else cwd).
- Run the main command in a fixture project so `chromatic.log`, `chromatic-diagnostics.json` and `chromatic.config.json` never land in the checkout. Create one with `$S fixture`, which makes a disposable `package.json` plus a git repo with one commit at `$FIXTURE`.
- Arguments after `--` are passed to `node dist/bin.cjs` literally. Env vars like `CHROMATIC_INDEX_URL`, `CHROMATIC_PROJECT_TOKEN` and `LOG_LEVEL` pass through from your shell, for `tty` too.
- Journeys that need new commits (TurboSnap) run in an e2e fixture (`$S e2e-fixture`, below), never on the developer's branch. When the change is to the repo's own Storybook, use a throwaway checkout instead: `$S checkout` adds a git worktree of `HEAD` at `$CHECKOUT` on a local branch `vcc-$RUN_ID`, sharing the repo's `node_modules`. `$S checkout-storybook` builds its Storybook into `$CHECKOUT_SB_DIR`. Drive it with `--cwd "$CHECKOUT"`. Never commit on the developer's branch.
- Assert on stable handles: the exact message strings in `node-src/ui/messages/**`, exit codes from `node-src/lib/setExitCode.ts` (0 OK, 1 changes, 254 INVALID_OPTIONS, 255 UNKNOWN_ERROR, 201 FETCH_ERROR, …; 253 for no `package.json` is a hard-coded exit in `node-src/index.ts` with no `exitCodeKey`), file paths, and JSON keys read with `jq`. Do not assert on timestamps or log prefixes.

The per-feature recipes are in [`features/`](features/README.md). Read its README first.

## Compare, reproduce elsewhere, try a canary

Most verification is "the branch behaves differently from main, in a project like the user's". The helper covers that too, so don't hand-roll copies of `dist/` or ad-hoc run scripts:

- **Main vs branch.** `MAIN_CLI=$($S build-ref main origin/main | tail -1)` builds `origin/main` in a detached worktree under `$WORK` that shares `node_modules`. Drive both with the same arguments: `$S run <label>-main --cli "$MAIN_CLI" -- …` and `$S run <label>-branch -- …`, then diff the outputs with `jq` (drop `generatedAt` from manifests). Any ref works, such as a PR head you fetched. Because the worktree shares this checkout's `node_modules`, the ref is built and run with the branch's dependencies; `build-ref` warns on stderr when `package.json` or `yarn.lock` differ. For a change that bumps dependencies, compare against a published release or canary (`install-published`) instead. Don't copy a `dist/` out of the repo: the bundle resolves externals such as `semver` from the `node_modules` beside it and fails with `Cannot find module`.
- **An e2e fixture project.** `e2e/fixtures/` has bare Storybook projects: `react-vite`, `react-webpack5` and `react-rsbuild` (npm, Storybook at the root), and `monorepo-npm`, `monorepo-yarn-classic`, `monorepo-yarn` and `monorepo-pnpm` (Storybook in `packages/ui`, which imports `@myorg/shared`; nothing imports `@myorg/backend`). See `e2e/README.md`. `F=$($S e2e-fixture <name> [copy] | tail -1)` runs `yarn fixture` into `$WORK/e2e-<name>[.<copy>]`, its own git repo with one commit and a frozen install, then switches it to a branch `vcc-$RUN_ID-<name>[.<copy>]-<short sha>` and prints the branch name. Each name and copy can be prepared once per run: reuse it (`F=$WORK/e2e-<name>`) for later read-only journeys, and pass a copy name when you need another independent copy. That branch matters: every prepared copy starts on `main`, and copies publishing to one project on the same branch use each other's builds as baselines, so TurboSnap fails with `missing git history`. The copy's own commit SHA makes the name unique even when a later session reuses the same `RUN_ID`. Commit edits with `$S commit "$F" "<message>"`. Drive the main command with `--cwd "$F"` (or `"$F/packages/ui"`) and `--build-script-name build-storybook`: the fixture scripts leave out the stats flag, so this exercises the CLI adding it. For a prebuilt Storybook or the offline subcommands, build it yourself with `(cd "$F" && : | npx storybook build --stats-json)`, or `(cd "$F/packages/ui" && : | npx storybook build --stats-json)` for a `monorepo-*` fixture. Installs need the npm registry, and `monorepo-pnpm` fetches pnpm with `npx`.
- **Some other project.** When no fixture has the layout you need, prepare the closest fixture and change the copy. Commit before driving, because TurboSnap and the manifest hash files on disk. Don't add scenario-specific files to `e2e/fixtures/` itself.
- **A published canary or release.** `PUB_CLI=$($S install-published canary <version> | tail -1)` installs `chromatic@<version>` under `$WORK`, waiting for a fresh canary to reach npm (about a minute after its release job passes). Drive it with `--cli "$PUB_CLI"`.
- `$S cleanup` removes all of these.

Driving through `$S run` or `$S tty` matters: they give the CLI a pipe or TTY on stdin. The repo's own `yarn build-storybook` crashes with `process.stdin.unref is not a function` when stdin is `/dev/null` (see Launch); the built CLI does not.

## Evidence

- Location: `$EVIDENCE` = `${VERIFY_ROOT:-${TMPDIR:-/tmp}/verify-chromatic-cli}/$RUN_ID/evidence/`. Cleanup never deletes it.
- Every proof has `command.txt` (cwd and exact argv), both output streams or the TTY pane, and `exit_code`. If the feature writes files (trimmed stats, diagnostics JSON, log file, JUnit XML), copy them into `$EVIDENCE/<label>/` or write them there directly with flags like `--diagnostics-file "$EVIDENCE/<label>/d.json"`. Then inspect them with `jq`, `wc` or `ls`.
- Proof standards:
  - Exercise the real user path, which is `dist/bin.cjs` with real flags. Do not import `node-src` functions, add test-only flags, or vi-mock anything.
  - Capture the action and the resulting state. An exit code alone is not proof. Pair it with the message or file that shows why.
  - Verify side effects alongside visible output. `trim-stats-file` writes a file. A publish creates a build on Chromatic. Diagnostics contain the resolved options.
  - `--dry-run` is not offline. It still authenticates and, per `node-src/tasks/initialize/announceBuild.ts`, still announces a build to the backend. It skips only upload, verify and snapshot ("Skipped due to --dry-run"). Never use it as a "safe, local" mode.
  - Mocks are allowed only at an existing production boundary. The only one is `CHROMATIC_INDEX_URL`, which selects the backend. Point it at staging (`https://index.staging-chromatic.com`) or dev, never at a hand-rolled fake that you then call proof of a publish.
- CLI 18.13.1 and later keep the project token and session JWT out of diagnostics and log files (CAP-5317). Older releases, which `install-published` can install, put the raw token at `.analytics.client.client.env.CHROMATIC_PROJECT_TOKEN`, the session JWT at `.analytics.client.headers.Authorization`, and any `-t <token>` in `.options.originalArgv`. See `publish-build` and the `diag-files` journey. Always pass real tokens via `CHROMATIC_PROJECT_TOKEN`, never `-t`. The helper writes a `-t` value to `command.txt` as `REDACTED`. `$S cleanup` deletes `.analytics` and redacts `-t` values in `.options.originalArgv` in every JSON file in `$EVIDENCE`, so run it before sharing evidence.

## Cleanup

```bash
$S cleanup
```

It stops only the tmux servers this `RUN_ID` started, as recorded in `$RUN_DIR/tmux-sessions`. It never kills by process name. It removes the `$CHECKOUT` worktree and deletes its `vcc-$RUN_ID` branch, removes `$WORK` (the Storybook builds, the fixture, trimmed stats), scrubs every JSON file in `$EVIDENCE`, and then lists the surviving `$EVIDENCE`. Run it after every failed iteration too. It does not touch the developer's branch, working tree, `node_modules/` or `dist/`. The next run reuses them.

A real publish (`publish-build`) leaves a build on the Chromatic project. Cleanup cannot undo that. Use a disposable project token or staging.

## Helpers

| Command | What it does |
|---|---|
| `$S setup` | Install, build the CLI, build this run's Storybook stats fixture |
| `$S rebuild [--storybook]` | Re-run `yarn build` (plus the Storybook fixture) after source edits |
| `eval "$($S env)"` | Export `REPO WORK EVIDENCE SB_DIR SB_STATS FIXTURE CLI CHECKOUT CHECKOUT_SB_DIR` for `RUN_ID` |
| `$S doctor` | Read-only health check; exit 1 on any FAIL |
| `$S fixture` | (Re)create the disposable project at `$FIXTURE`; prints its path |
| `$S e2e-fixture <name> [copy]` | Prepare `e2e/fixtures/<name>` at `$WORK/e2e-<name>[.<copy>]` on its own branch `vcc-$RUN_ID-<name>[.<copy>]-<short sha>`; prints its path |
| `$S commit <dir> <message>` | Commit every change in a scratch repo under `$WORK`, without signing or hooks |
| `$S checkout` | Add a throwaway worktree of `HEAD` at `$CHECKOUT` on branch `vcc-$RUN_ID`; prints its path |
| `$S checkout-storybook` | Build `$CHECKOUT`'s Storybook into `$CHECKOUT_SB_DIR` |
| `$S build-ref <name> <ref>` | Build the CLI at a git ref in a worktree under `$WORK`; prints its `bin.cjs` |
| `$S install-published <name> <version>` | Install a published release or canary under `$WORK`; prints its `bin.cjs` |
| `$S run <label> [--cwd D] [--cli B] -- args` | Non-TTY drive with captured stdout/stderr/exit; `--cli` picks another bundle |
| `$S tty <label> [--cwd D] [--cli B] [--timeout N] -- args` | TTY drive on its own tmux server; captured pane + exit |
| `$S cleanup` | Stop owned tmux servers, remove the checkout, ref builds, and `$WORK`, scrub and keep `$EVIDENCE` |

Keep the feature map honest as the CLI changes. See `/maintain-verification-skill`.

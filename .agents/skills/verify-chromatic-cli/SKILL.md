---
name: verify-chromatic-cli
description: Drive the locally built Chromatic CLI (`chromatic` / `dist/bin.cjs` in chromaui/chromatic-cli) the way a user does from a terminal and capture proof — stdout, stderr, exit codes, written files, TTY output. Use when you need to show that a change to bin-src/ or node-src/ works in the real CLI, not just in vitest: the main publish command and its option/config preflight, `trace`, `turbosnap-manifest`, and `trim-stats-file`.
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
eval "$($S env)" # exports REPO WORK EVIDENCE SB_DIR SB_STATS FIXTURE CLI for this RUN_ID
```

Ready means `$S setup` ends with `==> setup done for RUN_ID=…` and `$S doctor` exits 0. A cold `setup` takes about 2 minutes (install about 40s, build about 40s, Storybook about 15s).

After you edit source, run `$S rebuild` before driving again. Use `$S rebuild --storybook` if the change affects stories or `.storybook/`. Driving a stale `dist/` proves nothing, and `doctor` fails on it.

Setup facts the helper already handles, so don't reintroduce these mistakes by hand:
- Yarn 4.18.0 comes from corepack (`packageManager` field). If corepack fails to download from `repo.yarnpkg.com` (403 behind an egress proxy), the helper sets `COREPACK_NPM_REGISTRY=https://registry.npmjs.org`.
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
- The tmux sessions this run owns, and the evidence path.

Run it first, and again whenever output looks wrong.

## Drive

Two drivers, both writing to `$EVIDENCE/<label>/`:

```bash
# Non-interactive (what CI users see). stdin is an empty pipe, so the CLI is non-TTY.
$S run <label> [--cwd DIR] -- <chromatic args...>
#   writes command.txt, stdout.txt, stderr.txt, exit_code; prints exit + heads of both streams

# Interactive TTY (clack spinners, interactive rendering). Runs in tmux session vcc-$RUN_ID-<label>.
$S tty <label> [--cwd DIR] [--timeout SECS] -- <chromatic args...>
#   writes command.txt, pane.txt (full scrollback), exit_code; kills its own session when done
```

- `--cwd` defaults to the repo root. Use the repo root for `trace` and `turbosnap-manifest`: they hash and resolve files relative to cwd.
- Run the main command in a fixture project so `chromatic.log`, `chromatic-diagnostics.json` and `chromatic.config.json` never land in the checkout. Create one with `$S fixture`, which makes a disposable `package.json` plus a git repo with one commit at `$FIXTURE`.
- Arguments after `--` are passed to `node dist/bin.cjs` literally. Env vars like `CHROMATIC_INDEX_URL`, `CHROMATIC_PROJECT_TOKEN` and `LOG_LEVEL` pass through from your shell.
- Assert on stable handles: the exact message strings in `node-src/ui/messages/**`, exit codes from `node-src/lib/setExitCode.ts` (0 OK, 1 changes, 254 INVALID_OPTIONS, 253 no package.json, 255 UNKNOWN_ERROR, 201 FETCH_ERROR, …), file paths, and JSON keys read with `jq`. Do not assert on timestamps or log prefixes.

The per-feature recipes are in [`features/`](features/README.md). Read its README first.

## Evidence

- Location: `$EVIDENCE` = `${VERIFY_ROOT:-${TMPDIR:-/tmp}/verify-chromatic-cli}/$RUN_ID/evidence/`. Cleanup never deletes it.
- Every proof has `command.txt` (cwd and exact argv), both output streams or the TTY pane, and `exit_code`. If the feature writes files (trimmed stats, diagnostics JSON, log file, JUnit XML), copy them into `$EVIDENCE/<label>/` or write them there directly with flags like `--diagnostics-file "$EVIDENCE/<label>/d.json"`. Then inspect them with `jq`, `wc` or `ls`.
- Proof standards:
  - Exercise the real user path, which is `dist/bin.cjs` with real flags. Do not import `node-src` functions, add test-only flags, or vi-mock anything.
  - Capture the action and the resulting state. An exit code alone is not proof. Pair it with the message or file that shows why.
  - Verify side effects alongside visible output. `trim-stats-file` writes a file. A publish creates a build on Chromatic. Diagnostics contain the resolved options.
  - Exit codes can lie. `trim-stats-file` exits 0 even when it fails. Assert on the `Wrote …` line and the file.
  - `--dry-run` is not offline. It still authenticates and, per `node-src/tasks/initialize/announceBuild.ts`, still announces a build to the backend. It skips only upload, verify and snapshot ("Skipped due to --dry-run"). We observed it opening a connection to `index.chromatic.com` even with `--dry-run`. Never use it as a "safe, local" mode.
  - Mocks are allowed only at an existing production boundary. The only one is `CHROMATIC_INDEX_URL`, which selects the backend. Point it at staging (`https://index.staging-chromatic.com`) or dev, never at a hand-rolled fake that you then call proof of a publish.
- Diagnostics files are not safe to share after a real run. They redact only the `projectToken`, `reportToken` and `userToken` keys. As observed on 2026-10-17 on 18.13.0, they still contain the raw project token at `.analytics.client.client.env.CHROMATIC_PROJECT_TOKEN`, the session JWT at `.analytics.client.headers.Authorization`, and any `-t <token>` in `.options.originalArgv`. See `publish-build` and the `diag-files` journey. Always pass real tokens via `CHROMATIC_PROJECT_TOKEN`, never `-t`, so `command.txt` stays clean. Before keeping or sharing a `d.json` from an authenticated run, scrub it: `jq 'del(.analytics)' d.json > d.tmp && mv d.tmp d.json`.

## Cleanup

```bash
$S cleanup
```

It kills only the tmux sessions this `RUN_ID` started, as recorded in `$RUN_DIR/tmux-sessions`. It never kills by process name. It removes `$WORK` (the Storybook build, the fixture, trimmed stats) and then lists the surviving `$EVIDENCE`. Run it after every failed iteration too. It does not touch the repo checkout, `node_modules/` or `dist/`. Those are the developer's, and the next run reuses them.

A real publish (`publish-build`) leaves a build on the Chromatic project. Cleanup cannot undo that. Use a disposable project token or staging.

## Helpers

| Command | What it does |
|---|---|
| `$S setup` | Install, build the CLI, build this run's Storybook stats fixture |
| `$S rebuild [--storybook]` | Re-run `yarn build` (plus the Storybook fixture) after source edits |
| `eval "$($S env)"` | Export `REPO WORK EVIDENCE SB_DIR SB_STATS FIXTURE CLI` for `RUN_ID` |
| `$S doctor` | Read-only health check; exit 1 on any FAIL |
| `$S fixture` | (Re)create the disposable project at `$FIXTURE`; prints its path |
| `$S run <label> [--cwd D] -- args` | Non-TTY drive with captured stdout/stderr/exit |
| `$S tty <label> [--cwd D] [--timeout N] -- args` | TTY drive in an owned tmux session; captured pane + exit |
| `$S cleanup` | Kill owned sessions, remove `$WORK`, keep `$EVIDENCE` |

Keep the feature map honest as the CLI changes. See `/maintain-verification-skill`.

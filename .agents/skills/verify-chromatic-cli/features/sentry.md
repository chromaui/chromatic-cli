# Sentry reporting

The CLI and the GitHub Action report unexpected failures to Chromatic's Sentry project. Users never see it, but a change to what gets reported, what an event contains, or whether it arrives before the process exits is a behavior change and needs the same before/after proof as visible output. This recipe builds bundles with Sentry turned on, points them at a local sink instead of Sentry, and counts and keeps what each drive sends.

## Sub-features

- `sentry-cli-event` sends one `event` item, plus a `session` item, when the CLI fails with an error that isn't a user error.
- `sentry-action-flush` delivers the Action's event before the Action exits.
- `sentry-payload` is the event as Sentry receives it: exception, `environment`, `release`, `dist`, tags and breadcrumbs. Use it to show a secret stays out of an event or a fingerprint changes.
- `sentry-off` runs every other drive with `DISABLE_ERROR_MONITORING=true`, so nothing reaches the real Sentry project. Its `command.txt` says `Sentry: off (DISABLE_ERROR_MONITORING=true)`.

## How to get to it (user POV)

- Run any published `chromatic` release, from a terminal or CI. Published bundles are built with `CI` set, which turns Sentry on.
- Run the published GitHub Action (`action/register.cjs`).
- Set `DISABLE_ERROR_MONITORING=true` to turn it off. There is no flag.

## Driving it with control-chromatic

Preconditions:

- `$S fixture` has made `$FIXTURE`. These journeys need only a git repo with a `package.json`.
- `export CHROMATIC_INDEX_URL=http://127.0.0.1:9`, a closed local port, so authentication fails with a fetch error (exit `201`) and no request leaves the machine. Any failure that isn't a user error is reported; pick one that reaches the code you changed.

- **Build both sides with Sentry on.** `BASE=$(git merge-base HEAD origin/main)`, `MAIN_CLI=$($S build-ref main "$BASE" --sentry)` and `BRANCH_CLI=$($S build-ref branch WORKTREE --sentry)`. `WORKTREE` builds this checkout as it is: uncommitted changes included, ignored files left out. Any ref works too. Each build prints `==> Sentry DSN points at the sink on 127.0.0.1:<port> (release verify-$RUN_ID)` on stderr and the `bin.cjs` path on stdout.
- **CLI event.** `$S run sentry-cli-main --cwd "$FIXTURE" --cli "$MAIN_CLI" -- -t chpt_0000000000000000 --skip-update-check`. Exit code `201`. The output ends with `-- sentry: 1 events (items: 1 event, 1 session)` and the event's message, `request to http://127.0.0.1:9/graphql failed, reason: connect ECONNREFUSED 127.0.0.1:9`. `command.txt` says `Sentry: local sink on 127.0.0.1:<port>`, and every item is in `$EVIDENCE/sentry-cli-main/sentry.jsonl`. `$S tty` starts the sink the same way.
- **Payload.** `jq -c 'select(.type == "event") | .payload | {environment, release, dist, exception: .exception.values[-1]}' "$EVIDENCE/sentry-cli-main/sentry.jsonl"` shows `environment` `production`, `release` `verify-$RUN_ID` and `dist` `cli` (`action` for the Action). Breadcrumbs are in `.payload.breadcrumbs` and tags in `.payload.tags`. To show a token stays out, count it in the whole file: `grep -c chpt_ "$EVIDENCE/sentry-cli-main/sentry.jsonl"`.
- **Action flush.** `$S run sentry-action-main-1 --cli "$MAIN_CLI" --action --cwd "$FIXTURE" -- projectToken=chpt_0000000000000000 skipUpdateCheck=true` drives the Action bundle built beside `$MAIN_CLI`; then do the same with `$BRANCH_CLI`. Repeat each five times, since delivery races the exit. Before the Action flushed Sentry (#1745), every run exited `201` with `-- sentry: 0 events (items: none)`; with the fix, every run sends `1 events (items: 1 event, 1 session)`. The push event and `GITHUB_OUTPUT` the Action used are in the evidence dir.

## Gotchas

- When `CI` is unset in your shell, `$S setup`, `$S rebuild`, a plain `build-ref` and `yarn build` bake in `SENTRY_ENVIRONMENT=development` (`tsdown.config.ts`), which turns Sentry off whatever you set at run time. Zero events from such a bundle prove nothing. Don't work around it with `CI=1 yarn build` in the repo: that `dist/` reports to the real Sentry project when run outside the helper.
- Only drive Sentry builds through `$S run` or `$S tty`. Their DSN points at this run's sink port, and the sink only listens during a drive, so a direct `node` run delivers nothing.
- Every Sentry build of a `RUN_ID` shares one sink port, so drive them one at a time. When the port is taken, the drive stops with `the Sentry sink could not listen`.
- Count `type == "event"` items. Runs also send `session` and `client_report` items, which aren't error reports.
- `--skip` and `--dry-run` still authenticate, so against the closed port they fail with exit `201` like any other run.
- With `--action`, the Action sees a `push` of the fixture's `HEAD` to `my-org/my-app`. Without a `projectToken` input, it uses `CHROMATIC_PROJECT_TOKEN` from your shell.
- To show nothing reached the real Sentry project: `build-ref --sentry` refuses a bundle that still names Sentry's ingest host after the rewrite, and a stray event would carry release `verify-$RUN_ID`, so searching the project for that release should find nothing.

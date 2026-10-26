# Publish a build

The main `chromatic` command lets a user publish a Storybook to Chromatic and start a visual test build. It authenticates with the project token, gathers git info, reads or builds the Storybook, announces a build, uploads files, verifies the published Storybook, and waits for snapshots. It exits with a code that reflects the build result. This is the CLI's core journey, and it needs the real backend.

## Sub-features

- `pub-prebuilt` publishes an already-built Storybook (`--storybook-build-dir`) and runs the build's tests to completion.
- `pub-build` runs the project's `build-storybook` script, adding the output and stats flags, then publishes.
- `pub-exit-once-uploaded` exits `0` once the Storybook is published, without waiting for tests (`--exit-once-uploaded`).
- `pub-dry-run` authenticates and announces a build, but skips publish, verify and tests (`--dry-run`).
- `pub-skip` marks the commit as passing without creating a build (`--skip`).
- `pub-junit` writes a JUnit XML of the build results (`--junit-report`).

## How to get to it (user POV)

- Run `npx chromatic --project-token <token>` in a project with a `build-storybook` script.
- Run `npx chromatic -t <token> --storybook-build-dir storybook-static` after building Storybook yourself.
- Set `CHROMATIC_PROJECT_TOKEN` and run `yarn chromatic` in this repo, which publishes the repo's own stories.
- Run the GitHub Action `chromaui/action`. That entry point is not mapped here.

## Driving it with control-chromatic

Preconditions:

- `$S doctor` exits 0 and reports `INFO backend … reachable` and `INFO CHROMATIC_PROJECT_TOKEN is set`.
- Prefer staging: `CHROMATIC_INDEX_URL=https://index.staging-chromatic.com` with a staging project's token. Use production only with a disposable project. Never use a shared or customer project.
- The token comes from `CHROMATIC_PROJECT_TOKEN` in the environment, never `-t`. It belongs to a disposable or test project. Every journey except `pub-skip` creates a real build that cleanup cannot remove.
- `$SB_DIR` holds this run's Storybook build, from `$S setup`.
- Drive from the repo root, which is a git repo with commits. The CLI reads branch and commit from cwd.

- **Prebuilt publish.** Run `mkdir -p "$EVIDENCE/pub-prebuilt" && $S run pub-prebuilt -- --storybook-build-dir "$SB_DIR" --exit-zero-on-changes --skip-update-check --diagnostics-file "$EVIDENCE/pub-prebuilt/d.json" --log-file "$EVIDENCE/pub-prebuilt/chromatic.log"`. Exit code `0`. stdout runs, in order:
  - `Authenticated with Chromatic`, with the token masked as `'****************<last 4>'`
  - `Build <N> initialized`
  - `Build Storybook [skipped]` / `Using prebuilt Storybook at <SB_DIR>`
  - `Publish complete`, followed by `Uploaded <n> files` on the first build or `No new files to upload` on later ones
  - `✔ Storybook published`
  - `ℹ View your Storybook at https://<appId>-<hash>.chromatic.com/`
  - `Started build <N>`, `Running <n> tests`, then `Build <N> auto-accepted` (first build) or `Build <N> completed`. When the build runs no tests, these are replaced by `Finalizing build` / `→ No tests run` and `Test your stories` / `→ No UI tests or UI review enabled`; `.build.status` is still `PASSED`.

  Then `jq -c '{exitCodeKey, storybookUrl, n: .build.number, status: .build.status, webUrl: .build.webUrl, tests: .build.testCount}' "$EVIDENCE/pub-prebuilt/d.json"` matches stdout, with `.build.webUrl` = `https://www.chromatic.com/build?appId=<appId>&number=<N>`. That URL is the external side effect.
- **Build it, in a user-like project.** Run `F=$($S e2e-fixture react-vite | tail -1) && mkdir -p "$EVIDENCE/pub-build" && env -u CI $S run pub-build --cwd "$F" -- --build-script-name build-storybook --exit-zero-on-changes --skip-update-check --diagnostics-file "$EVIDENCE/pub-build/d.json"`. Exit code `0`. stderr has the one-commit warning `✖ Found only one commit`. stdout shows `Build <N> initialized`, then `Running command: npm run build-storybook -- --output-dir=<tmp> --stats-json=<tmp>` (the CLI adds `--stats-json` even without `--only-changed`), `Storybook built in …`, `View build log at <F>/build-storybook.log`, `✔ Storybook published`, and `Build <N> completed` or `auto-accepted`. `jq -c '{exitCodeKey, s: .build.status, url: .build.webUrl}' "$EVIDENCE/pub-build/d.json"` matches. Use `react-webpack5`, `react-rsbuild` or `monorepo-*` (with `--cwd "$F/packages/ui"`, where pnpm's command has no `--` separator) for other builders and package managers.
- **Exit once uploaded.** Run `mkdir -p "$EVIDENCE/pub-exit-once-uploaded" && $S run pub-exit-once-uploaded -- --storybook-build-dir "$SB_DIR" --exit-once-uploaded --force-rebuild --skip-update-check --log-file "$EVIDENCE/pub-exit-once-uploaded/chromatic.log"`. Exit code `0`. stdout shows `✔ Storybook published` and ends with `Test your stories` / `→ Skipped due to --exit-once-uploaded`, or `→ No UI tests or UI review enabled` when the build runs no tests.
- **Dry run.** Run `mkdir -p "$EVIDENCE/pub-dry-run" && $S run pub-dry-run -- --storybook-build-dir "$SB_DIR" --dry-run --force-rebuild --skip-update-check --log-file "$EVIDENCE/pub-dry-run/chromatic.log"`. Exit code `0`. stdout still shows `Build <N> initialized`, so a build was announced server-side. Then `Publish your built Storybook`, `Verify your Storybook` and `Test your stories` each read `→ Skipped due to --dry-run`. `grep -c "Connecting to ${CHROMATIC_INDEX_URL:-https://index.chromatic.com}" "$EVIDENCE/pub-dry-run/chromatic.log"` is `1`.
- **Skip.** Run `mkdir -p "$EVIDENCE/pub-skip" && $S run pub-skip -- --skip --skip-update-check --log-file "$EVIDENCE/pub-skip/chromatic.log"`. Exit code `0`. stdout ends with `Skipping build` / `→ Skipped build for commit <sha> due to --skip`. There is no `Build <N> initialized` line, and nothing is uploaded.
- **JUnit.** Run `mkdir -p "$EVIDENCE/pub-junit" && $S run pub-junit -- --storybook-build-dir "$SB_DIR" --exit-zero-on-changes --force-rebuild --skip-update-check --junit-report "$EVIDENCE/pub-junit/build-{buildNumber}.xml" --log-file "$EVIDENCE/pub-junit/chromatic.log"`. Exit code `0`. stdout says `ℹ Wrote JUnit XML report to <EVIDENCE>/pub-junit/build-<N>.xml`. That file has one `<testsuite name="Chromatic build <N>" tests="<n>" …>` with `buildNumber`, `buildStatus`, `buildUrl` and `storybookUrl` properties, and `grep -c "<testcase"` equals that `<n>`. Visual changes appear as `<failure message="Snapshot contains visual changes and must be reviewed" type="PENDING"/>`.
- **Proof.** For each label keep the command, both streams and the exit code. Keep diagnostics, log and JUnit where the journey writes them. Also keep the build URL from stdout or diagnostics. Run `$S cleanup` before sharing any of it, because it scrubs the diagnostics (see Gotchas).

## Gotchas

- Diagnostics must not hold credentials. Check with `jq -c 'paths(type=="string" and test("^chpt_|^Bearer ")) as $p | $p' d.json`; the result must be empty and there must be no `.analytics` key. CLI 18.13.1 and later pass (CAP-5317). Older releases put the raw project token at `.analytics.client.client.env.CHROMATIC_PROJECT_TOKEN` and the session JWT at `.analytics.client.headers.Authorization`, even when the token comes only from the env var. `--upload-metadata`, and TurboSnap by default, upload `d.json` to the published Storybook's `.chromatic/` folder, so with an older CLI rotate the token after the run. `$S cleanup` still deletes `.analytics` and redacts `-t` values in every JSON file in `$EVIDENCE`; run it before sharing evidence.
- A brand-new project is in onboarding mode, with `.isOnboarding: true` in diagnostics. stdout says `Continue setup at https://www.chromatic.com/setup?appId=…` instead of `View build details at …`. Build 1 is `auto-accepted`, and successful builds print `✔ Build passed. Welcome to Chromatic!` instead of `✔ Build <N> passed!`.
- With `--exit-zero-on-changes`, a `PENDING` build with visual changes prints `✔ Build <N> completed`, not `passed!` (CAP-5322, fixed). The JUnit report for such a build shows `failures` greater than `0`. Assert on `.build.status`, `.build.changeCount` or the JUnit file, not on the summary line. The changes line is pluralized: `1 visual change must be accepted as baseline.` for one change. Without the flag the same build exits `1` (`BUILD_HAS_CHANGES`). See `turbosnap-only-changed`, `ts-onechange-strict`.
- `--dry-run` still authenticates and announces a real build, which shows as `Build <N> initialized` and uses up a build number. It skips only publish, verify and tests. It is not offline, and it is not side-effect free.
- Without `--exit-zero-on-changes`, a build with visual changes exits `1` (`BUILD_HAS_CHANGES`). That is a correct result, not a failed journey. Read `exitCodeKey` in diagnostics.
- `--skip` is keyed to the current commit. Run it last, or on a commit you will not publish again.
- The repo's own `build-storybook` script already passes `--stats-json`, so it never shows the CLI adding the flag. Drive builds through an e2e fixture (`pub-build`). In this repo the script also fails when stdin is `/dev/null` (see SKILL.md Launch).
- A freshly prepared fixture has one commit, so its first run prints `✖ Found only one commit` as a warning. When `CI` is set or a CI environment is detected, that message is fatal instead. Run with `env -u CI`.
- Never pass a real token as `-t`. `command.txt` records it as `REDACTED`, but CLIs older than 18.13.1 write it verbatim to diagnostics `.options.originalArgv` (see `preflight-and-config`).
- `--patch-build`, `--only-changed` and `--auto-accept-changes` change baselines on the real project. Do not exercise them against a shared project.
- Same commit and branch as a passed build means the CLI skips the run: `ℹ Skipping rebuild of an already fully passed/accepted build`, exit `0`, and no build. Every journey here runs from the repo root on one commit, so all but the first need `--force-rebuild` (the commands above include it). An exit `0` alone is not proof the journey ran; check for `Build <N> initialized`.
- Concurrent builds on one project token must be on different branches. Builds published concurrently on the same branch become each other's baselines, so TurboSnap journeys then report `TurboSnap disabled due to missing git history` or trace against the wrong parent. This applies across repos too: every prepared e2e fixture starts on `main`, and the CLI adds the last `main` build as a parent even when its commit is from another copy. `$S e2e-fixture` puts each copy on its own branch for this reason. To run several in parallel, prepare a separate copy for each with `$S e2e-fixture <name> <copy>`, using a different copy name each time; every copy gets its own branch, which starts its own baseline chain with no ancestor. Without separate copies, run them one at a time. Never create branches in `$CHECKOUT` for this: it is a worktree of the developer's repo, so they land there, and `cleanup` only deletes `vcc-$RUN_ID`.

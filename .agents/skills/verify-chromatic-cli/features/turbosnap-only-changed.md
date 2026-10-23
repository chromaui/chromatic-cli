# TurboSnap on a real build

`--only-changed` lets a user run only the stories affected by files changed since the baseline build. The CLI finds the parent build in git history, lists changed files, traces them through `preview-stats.json` to affected story files, captures only those snapshots, and copies the rest from the baseline. With no affected story files, it skips the build entirely. With TurboSnap enabled, it also uploads metadata files to the published Storybook by default.

## Sub-features

- `ts-baseline` publishes the first build on a fresh branch, with TurboSnap disabled for lack of an ancestor.
- `ts-nochange` skips the whole build when no changed file affects a story.
- `ts-onechange` traces a change in a workspace package to the one story that imports it, captures that story and copies the rest.
- `ts-onechange-strict` exits `1` (`BUILD_HAS_CHANGES`) for a captured change without `--exit-zero-on-changes`.
- `ts-trace-changed` prints the changed-file-to-story trace during the build (`--trace-changed`).
- `ts-metadata` uploads metadata files to `<storybookUrl>.chromatic/` when TurboSnap ran and the build was published.
- `ts-rebuild` disables TurboSnap and runs a full build when the commit and branch match the baseline build.

## How to get to it (user POV)

- Run `npx chromatic --only-changed` in CI after the project has at least one build on an ancestor commit.
- Run `npx chromatic --only-changed <branch-glob>` to enable it only on matching branches.
- Put `"onlyChanged": true` in `chromatic.config.json`.
- Add `--trace-changed` (or `--trace-changed=expanded`) to see why stories were selected, and `--untraced`/`--externals` to tune it.

## Driving it with control-chromatic

Preconditions:

- Everything in `publish-build` preconditions: backend reachable, token from `CHROMATIC_PROJECT_TOKEN`, disposable project.
- These journeys commit, so they run in a prepared e2e fixture, never on your branch. The commands use `monorepo-pnpm`. Any `monorepo-*` fixture works the same way, because each has `packages/ui` (the Storybook, with `Button` and `Badge` stories), `packages/shared` (imported by `Button`) and `packages/backend` (imported by nothing). Run `F=$($S e2e-fixture monorepo-pnpm ts | tail -1) && UI="$F/packages/ui"`. The `ts` copy name keeps it separate from the `monorepo-pnpm` copy that `trace-mono` and `tsm-mono` use, so it starts with exactly one commit. It is on its own branch `vcc-$RUN_ID-monorepo-pnpm.ts-<short sha>` (printed by `e2e-fixture`), so its baseline chain starts fresh.
- The CLI builds the Storybook itself, so every journey passes `A=(--build-script-name build-storybook --only-changed --skip-update-check)`. Set that array once.
- Each journey after the baseline needs its own new commit. Commit with `$S commit "$F" "<message>"`. On the baseline's commit TurboSnap is disabled (see `ts-rebuild`).
- `ts-onechange` uploads `d.json` to the published Storybook. It holds no credentials on CLI 18.13.1 and later; with an older CLI, rotate the token afterward (see Gotchas).
- Run the journeys in order, then create each label's evidence dir: `for l in ts-baseline ts-nochange ts-onechange ts-onechange-strict ts-rebuild; do mkdir -p "$EVIDENCE/$l"; done`.

- **Baseline.** Run `env -u CI $S run ts-baseline --cwd "$UI" -- "${A[@]}" --exit-zero-on-changes`. Exit code `0`. stdout shows `on branch 'vcc-$RUN_ID-monorepo-pnpm.ts-<short sha>'; no ancestor found; TurboSnap disabled`, and stderr has `⚠ TurboSnap disabled due to missing ancestor build` and the one-commit warning `✖ Found only one commit`.
- **No relevant change.** Change only the package nothing imports. Run `sed -i 's/Hello/Hi/' "$F/packages/backend/src/index.ts" && $S commit "$F" "backend only"`. Run `$S run ts-nochange --cwd "$UI" -- "${A[@]}" --trace-changed --exit-zero-on-changes --diagnostics-file "$EVIDENCE/ts-nochange/d.json" --log-file "$EVIDENCE/ts-nochange/chromatic.log"`. Exit code `0`. stdout shows:
  - `Found 1 changed files:` listing `packages/backend/src/index.ts`
  - `found 1 parent build and 1 changed file`
  - `ℹ Traced 1 changed file to 0 affected story files:`
  - `Bypassed 2 snapshots because no frontend files were changed.`
  - `✔ This build was skipped and will not be displayed in Chromatic.`
  - `ℹ View ancestor build details at …&number=<ancestor>`
  - `Publish skipped`

  In `d.json`, `.skip` is `true`, `.announcedBuild.status` is `ANNOUNCED`, and `.build.number` is the ancestor's. Nothing is uploaded: there is no `Uploading … metadata files` line.
- **One relevant change.** Change the workspace package that `Button` imports. Run `sed -i 's/slice(1)/slice(1).trim()/' "$F/packages/shared/src/index.ts" && $S commit "$F" "shared change"`. Run `$S run ts-onechange --cwd "$UI" -- "${A[@]}" --trace-changed --exit-zero-on-changes --diagnostics-file "$EVIDENCE/ts-onechange/d.json" --log-file "$EVIDENCE/ts-onechange/chromatic.log"`. Exit code `0`. stdout shows:
  - `Running command: pnpm run build-storybook --output-dir=<tmp> --stats-json=<tmp>`, because the fixture script leaves the stats flag out
  - `ℹ Traced <n> changed files to 1 affected story file:` with the tree `packages/shared/src/index.ts [changed]` → `packages/ui/src/Button.tsx` → `packages/ui/src/Button.stories.tsx` → `[story index]`. `<n>` counts every file changed since the baseline commit, so it can include the backend file from `ts-nochange`.
  - `Capturing 1 snapshot; copying 1 snapshot with TurboSnap.`
  - `Running 1 test affected by recent changes (skipping 1 test)`

  In `d.json`, `.build.actualCaptureCount` is `1`, `.build.inheritedCaptureCount` is `1`, and `.onlyStoryFiles | length` is `1`.
- **Metadata upload.** In the same run, stdout ends with `Uploading metadata files automatically because TurboSnap was enabled` and `ℹ Uploading <n> metadata files to <storybookUrl>.chromatic/`. The list that follows includes `build-storybook.log`, `chromatic.log`, `d.json` (your `--diagnostics-file` basename), `main.ts`, `preview.ts`, `preview-stats.trimmed.json`, `turbosnap-manifest.json` and `index.html`.
- **Strict exit.** Without `--exit-zero-on-changes`, a captured change fails the command. Make a new commit first, or this run is a `ts-rebuild` of `ts-onechange` and exits `0`: run `sed -i 's/New/Fresh/' "$UI/src/Button.tsx" && $S commit "$F" "strict change"`. Then run `$S run ts-onechange-strict --cwd "$UI" -- "${A[@]}" --diagnostics-file "$EVIDENCE/ts-onechange-strict/d.json" --log-file "$EVIDENCE/ts-onechange-strict/chromatic.log"`. Exit code `1`, and `jq -r .exitCodeKey "$EVIDENCE/ts-onechange-strict/d.json"` is `BUILD_HAS_CHANGES`. stderr contains `✖ <k> visual change(s) must be accepted as baseline(s). Review at …` and `this command failed with exit code 1`.
- **Rebuild.** Rerun on the same commit: `$S run ts-rebuild --cwd "$UI" -- "${A[@]}" --exit-zero-on-changes --diagnostics-file "$EVIDENCE/ts-rebuild/d.json"`. Exit code `0`. stdout shows `found 1 parent build; TurboSnap disabled`, and the output has `⚠ TurboSnap disabled due to rebuild`.
- **Restore.** Run `$S cleanup`. It removes `$WORK`, including the fixture copy and its commits. Your own branch and working tree were never touched: `git -C "$REPO" status --short` and `git -C "$REPO" log -1` are as they were before the journeys.
- **Proof.** Keep each label's command, streams, exit code and log. Keep the build URLs. `$S cleanup` scrubs each `d.json` (see `publish-build` Gotchas). Run it before sharing evidence.

To check a change to the repo's own stories instead, use `$S checkout` and `$S checkout-storybook`, drive with `--cwd "$CHECKOUT" -- --storybook-build-dir "$CHECKOUT_SB_DIR" --only-changed …`, and commit with `$S commit "$CHECKOUT" "<message>"`.

## Gotchas

- Uploaded metadata contains secrets. With TurboSnap on and a published build, `d.json` is uploaded to `<storybookUrl>.chromatic/`. Anyone who can open the published Storybook can read it. CLIs older than 18.13.1 put the raw project token and session JWT in it (CAP-5317); with those, rotate the token after the run. Run `$S cleanup` before sharing the local `d.json`.
- Two fixture copies on the same branch name share a baseline. Every prepared fixture starts on `main`, and the CLI adds the last build on the branch as a parent even when that commit isn't in this repo. TurboSnap then reports `found 2 parent builds; TurboSnap disabled` and `⚠ TurboSnap disabled due to missing git history`. Prepare fixtures with `$S e2e-fixture`, which gives each one its own branch, and never rename it back to `main`.
- Same commit means a full build. Rerunning on the commit and branch of the baseline build prints `⚠ TurboSnap disabled due to rebuild` and `found 1 parent build; TurboSnap disabled`. Whether it then captures anything depends on the baseline, so make a new commit for each TurboSnap journey.
- `Found only one commit` is about git history, not about the project. It appears on the baseline run of a fresh fixture, which has one commit. It warns locally but is fatal when `CI` is set or a CI environment is detected, so run with `env -u CI`. A branch with no earlier build gets `⚠ TurboSnap disabled due to missing ancestor build` instead. That warning is hidden while the project is onboarding.
- Change counts include inherited pending changes. A build that captures 1 snapshot can report a higher `changeCount`, and `ts-onechange-strict` can report more visual changes than it captured, when an earlier build still has unreviewed changes. Assert on `actualCaptureCount` and the trace, not `changeCount`.
- `--exit-zero-on-changes` prints `✔ Build <N> completed` for a `PENDING` build with changes. Read `.build.status` and `.build.changeCount` rather than the summary line.
- A skipped build (`ts-nochange`) prints `Publishing your built Storybook` before the skip message, then `Publish skipped` after it. Assert on `Publish skipped`.
- The trace in a build only lists changed files that reach a story. Files that reach none, such as `packages/backend/`, count toward `Found <n> changed files` but trace to 0 stories.
- `--untraced` and `--externals` on a real build are not mapped yet. The monorepo fixtures make them possible: `--untraced 'packages/shared/**'` or `--externals 'packages/shared/**'` on a `ts-onechange`-style commit.
- The first TurboSnap journey can compare against an older baseline than you expect. `found 1 parent build` names the parent, but changed files come from `.git.baselineCommits` in `d.json`, which can be an older build's commit (for example when the parent build was skipped or ran no tests). Check `.git.baselineCommits` when the changed-file count looks too high.

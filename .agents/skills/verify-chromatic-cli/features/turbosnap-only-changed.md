# TurboSnap on a real build

`--only-changed` lets a user run only the stories affected by files changed since the baseline build. The CLI finds the parent build in git history, lists changed files, traces them through `preview-stats.json` to affected story files, captures only those snapshots, and copies the rest from the baseline. With no affected story files, it skips the build entirely. With TurboSnap enabled, it also uploads metadata files to the published Storybook by default.

## Sub-features

- `ts-nochange` skips the whole build when no changed file affects a story.
- `ts-onechange` captures only the affected story file's snapshots and copies the rest.
- `ts-onechange-strict` exits `1` (`BUILD_HAS_CHANGES`) for the same change without `--exit-zero-on-changes`.
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

- Everything in `publish-build` preconditions: backend reachable, token from `CHROMATIC_PROJECT_TOKEN`, disposable project, `$SB_DIR` from `$S setup`.
- The project has an accepted or pending build on an ancestor of `HEAD`. Run `pub-prebuilt` first on a fresh project.
- `HEAD` is a different commit from that build. Otherwise TurboSnap is disabled (see `ts-rebuild`).
- The working tree is clean, so `git status --short` prints nothing.
- You accept that `ts-onechange` uploads diagnostics containing the token to Chromatic-internal metadata (see Gotchas).

- **No relevant change.** Commit only non-frontend files, such as docs under `.agents/`, after the baseline build. Run `mkdir -p "$EVIDENCE/ts-nochange" && $S run ts-nochange -- --storybook-build-dir "$SB_DIR" --only-changed --trace-changed --exit-zero-on-changes --skip-update-check --diagnostics-file "$EVIDENCE/ts-nochange/d.json" --log-file "$EVIDENCE/ts-nochange/chromatic.log"`. Exit code `0`. stdout shows:
  - `Found <n> changed files:` listing exactly those files
  - `found 1 parent build and <n> changed files`
  - `ℹ Traced <n> changed files to 0 affected story files`
  - `Bypassed <total> snapshots because no frontend files were changed.`
  - `✔ This build was skipped and will not be displayed in Chromatic.`
  - `ℹ View ancestor build details at …&number=<ancestor>`

  In `d.json`, `.skip` is `true`, `.announcedBuild.status` is `ANNOUNCED`, and `.build` is the ancestor build. Nothing is uploaded: there is no `Uploading … metadata files` line.
- **One relevant change.** Make a local-only commit that changes one module with a known story. Run `sed -i 's/{bold Missing project token}/{bold Missing project token (TurboSnap verify)}/' node-src/ui/messages/errors/missingProjectToken.ts && git -c user.email=verify@example.invalid -c user.name=verify commit -q -am "LOCAL ONLY: TurboSnap verification change (do not push)"`, then `$S rebuild --storybook`. Run `mkdir -p "$EVIDENCE/ts-onechange" && $S run ts-onechange -- --storybook-build-dir "$SB_DIR" --only-changed --trace-changed --exit-zero-on-changes --skip-update-check --diagnostics-file "$EVIDENCE/ts-onechange/d.json" --log-file "$EVIDENCE/ts-onechange/chromatic.log"`. Exit code `0`. stdout shows:
  - `ℹ Traced <n> changed files to 1 affected story file:` with the tree `missingProjectToken.ts [changed]` → `missingProjectToken.stories.ts` → `[story index]`
  - `Uploaded <a> files (…), skipped <b> files`
  - `Capturing 1 snapshot; copying <total-1> snapshots with TurboSnap.`
  - `Running 1 test affected by recent changes (skipping <total-1> tests)`

  In `d.json`, `.build.actualCaptureCount` is `1`, `.build.inheritedCaptureCount` is `<total-1>`, and `.onlyStoryFiles | length` is `1`.
- **Metadata upload.** In the same run, stdout ends with `Uploading metadata files automatically because TurboSnap was enabled` and `ℹ Uploading 7 metadata files to <storybookUrl>.chromatic/`, followed by `chromatic.log`, `d.json` (your `--diagnostics-file` basename), `main.ts`, `preview-stats.trimmed.json`, `preview.ts`, `turbosnap-manifest.json` and `index.html`.
- **Strict exit.** Without `--exit-zero-on-changes`, the same change fails the command. Run `mkdir -p "$EVIDENCE/ts-onechange-strict" && $S run ts-onechange-strict -- --storybook-build-dir "$SB_DIR" --only-changed --skip-update-check --diagnostics-file "$EVIDENCE/ts-onechange-strict/d.json"`. Exit code `1`, and `jq -r .exitCodeKey d.json` is `BUILD_HAS_CHANGES`. stderr contains `✖ <k> visual changes must be accepted as baselines.` and `this command failed with exit code 1`. If you run this right after `ts-onechange` on the same commit, it becomes a `ts-rebuild` as well (see Gotchas).
- **Restore.** Run `git reset -q --hard <commit before the LOCAL ONLY commit>`, then `$S rebuild`, then `git status --short`, which must print nothing. `$S doctor` passes. Never push the `LOCAL ONLY` commit, and check with `git branch -r --contains <sha>`, which must print nothing.
- **Proof.** Keep each label's command, streams, exit code and log. Keep the build URLs. Scrub each `d.json` with `jq 'del(.analytics)'` before keeping it.

## Gotchas

- Uploaded metadata contains secrets. With TurboSnap on and a published build, `d.json` is uploaded to `<storybookUrl>.chromatic/`, and on 18.13.0 it contains the raw project token and the session JWT (CAP-5317). This was observed on 2026-10-17. Those files are readable only by Chromatic employees, so impact is low. Still, use a disposable token, and scrub the local `d.json` before keeping evidence.
- Same commit means a full build. Rerunning on the commit and branch of the baseline build prints `⚠ TurboSnap disabled due to rebuild` and `found 1 parent build; TurboSnap disabled`, and captures every snapshot. Make a new commit for each TurboSnap journey. That log also prints `Traversing dependencies for undefined files` (CAP-5325).
- Change counts include inherited pending changes. On 2026-10-17, a build capturing 1 snapshot reported `changeCount: 2`. Build 4 still had an unreviewed change, which counts again. Assert on `actualCaptureCount` and the trace, not `changeCount`.
- `--exit-zero-on-changes` prints `✔ Build <N> passed!` for a `PENDING` build with changes (CAP-5322). The pass line is not evidence that there were no changes. Read `.build.status` and `.build.changeCount`.
- A skipped build (`ts-nochange`) prints a leftover `Publishing your built Storybook` line after the skip message (CAP-5326). Ignore it when asserting.
- The trace in a build only lists changed files that reach a story. Non-frontend files, such as `.agents/` docs, count toward `Found <n> changed files` but trace to 0 stories.
- The published Storybook host (`<appId>-<hash>.chromatic.com`) was not reachable from the 2026-10-17 proof environment. The uploaded files themselves were not fetched. The upload list and the local `d.json` were the evidence.
- `--untraced` and `--externals` on a real build are not mapped yet.

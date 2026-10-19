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
- The project has an accepted or pending build on the repo's `HEAD` or an ancestor of it. Run `pub-prebuilt` first on a fresh project.
- These journeys commit, so they run in a throwaway checkout, never on your branch. Run `$S checkout`, which adds a git worktree of `HEAD` at `$CHECKOUT` on a local branch `vcc-$RUN_ID`, then `$S checkout-storybook`, which builds that checkout's Storybook into `$CHECKOUT_SB_DIR`. `$S cleanup` removes the worktree and deletes the branch.
- Each journey needs its own new commit in `$CHECKOUT`. On the baseline's commit TurboSnap is disabled (see `ts-rebuild`).
- Until the CAP-5317 fix ships, `ts-onechange` uploads a `d.json` containing the project token to the published Storybook (see Gotchas). Use a disposable project and rotate its token afterward.

Set `COMMIT=(git -C "$CHECKOUT" -c user.email=verify@example.invalid -c user.name=verify -c commit.gpgsign=false commit -q)` once. The journeys below commit with `"${COMMIT[@]}"`, which never prompts for a signing key.

- **No relevant change.** Commit only a non-frontend file. Run `echo "verify $RUN_ID" >> "$CHECKOUT/.agents/skills/verify-chromatic-cli/features/README.md" && "${COMMIT[@]}" -am "LOCAL ONLY: non-frontend change"`. Run `mkdir -p "$EVIDENCE/ts-nochange" && $S run ts-nochange --cwd "$CHECKOUT" -- --storybook-build-dir "$CHECKOUT_SB_DIR" --only-changed --trace-changed --exit-zero-on-changes --skip-update-check --diagnostics-file "$EVIDENCE/ts-nochange/d.json" --log-file "$EVIDENCE/ts-nochange/chromatic.log"`. Exit code `0`. stdout shows:
  - `Found <n> changed files:` listing exactly those files
  - `found 1 parent build and <n> changed files`
  - `ℹ Traced <n> changed files to 0 affected story files`
  - `Bypassed <total> snapshots because no frontend files were changed.`
  - `✔ This build was skipped and will not be displayed in Chromatic.`
  - `ℹ View ancestor build details at …&number=<ancestor>`

  In `d.json`, `.skip` is `true`, `.announcedBuild.status` is `ANNOUNCED`, and `.build` is the ancestor build. Nothing is uploaded: there is no `Uploading … metadata files` line.
- **One relevant change.** Commit a change to one module with a known story. Run `sed -i 's/{bold Missing project token}/{bold Missing project token (TurboSnap verify)}/' "$CHECKOUT/node-src/ui/messages/errors/missingProjectToken.ts" && "${COMMIT[@]}" -am "LOCAL ONLY: TurboSnap verification change"`, then `$S checkout-storybook`. Run `mkdir -p "$EVIDENCE/ts-onechange" && $S run ts-onechange --cwd "$CHECKOUT" -- --storybook-build-dir "$CHECKOUT_SB_DIR" --only-changed --trace-changed --exit-zero-on-changes --skip-update-check --diagnostics-file "$EVIDENCE/ts-onechange/d.json" --log-file "$EVIDENCE/ts-onechange/chromatic.log"`. Exit code `0`. stdout shows:
  - `ℹ Traced <n> changed files to 1 affected story file:` with the tree `missingProjectToken.ts [changed]` → `missingProjectToken.stories.ts` → `[story index]`
  - `Uploaded <a> files (…), skipped <b> files`
  - `Capturing 1 snapshot; copying <total-1> snapshots with TurboSnap.`
  - `Running 1 test affected by recent changes (skipping <total-1> tests)`

  In `d.json`, `.build.actualCaptureCount` is `1`, `.build.inheritedCaptureCount` is `<total-1>`, and `.onlyStoryFiles | length` is `1`.
- **Metadata upload.** In the same run, stdout ends with `Uploading metadata files automatically because TurboSnap was enabled` and `ℹ Uploading <n> metadata files to <storybookUrl>.chromatic/`. The list that follows includes `chromatic.log`, `d.json` (your `--diagnostics-file` basename), `preview-stats.trimmed.json` and `turbosnap-manifest.json`.
- **Strict exit.** Without `--exit-zero-on-changes`, the same change fails the command. Run `mkdir -p "$EVIDENCE/ts-onechange-strict" && $S run ts-onechange-strict --cwd "$CHECKOUT" -- --storybook-build-dir "$CHECKOUT_SB_DIR" --only-changed --skip-update-check --diagnostics-file "$EVIDENCE/ts-onechange-strict/d.json" --log-file "$EVIDENCE/ts-onechange-strict/chromatic.log"`. Exit code `1`, and `jq -r .exitCodeKey "$EVIDENCE/ts-onechange-strict/d.json"` is `BUILD_HAS_CHANGES`. stderr contains `✖ <k> visual changes must be accepted as baselines.` and `this command failed with exit code 1`. If you run this right after `ts-onechange` on the same commit, it becomes a `ts-rebuild` as well (see Gotchas).
- **Restore.** Run `$S cleanup`. It removes `$CHECKOUT` and deletes the `vcc-$RUN_ID` branch, so the `LOCAL ONLY` commits are on no branch. Your own branch and working tree were never touched: `git -C "$REPO" status --short` and `git -C "$REPO" log -1` are as they were before the journeys.
- **Proof.** Keep each label's command, streams, exit code and log. Keep the build URLs. `$S cleanup` scrubs each `d.json` (see `publish-build` Gotchas). Run it before sharing evidence.

## Gotchas

- Uploaded metadata contains secrets. With TurboSnap on and a published build, `d.json` is uploaded to `<storybookUrl>.chromatic/`. Until the CAP-5317 fix ships, it contains the raw project token and the session JWT. Assume anyone who can open the published Storybook can read it. Use a disposable project, rotate its token after the run, and run `$S cleanup` before sharing the local `d.json`.
- Same commit means a full build. Rerunning on the commit and branch of the baseline build prints `⚠ TurboSnap disabled due to rebuild` and `found 1 parent build; TurboSnap disabled`, and captures every snapshot. Make a new commit for each TurboSnap journey.
- Change counts include inherited pending changes. A build that captures 1 snapshot can report a higher `changeCount` when an earlier build still has unreviewed changes. Assert on `actualCaptureCount` and the trace, not `changeCount`.
- `--exit-zero-on-changes` prints `✔ Build <N> passed!` for a `PENDING` build with changes (CAP-5322). The pass line is not evidence that there were no changes. Read `.build.status` and `.build.changeCount`.
- A skipped build (`ts-nochange`) prints a leftover `Publishing your built Storybook` line after the skip message (CAP-5326). Ignore it when asserting.
- The trace in a build only lists changed files that reach a story. Non-frontend files, such as `.agents/` docs, count toward `Found <n> changed files` but trace to 0 stories.
- `--untraced` and `--externals` on a real build are not mapped yet.

# E2E build with Vitest

`chromatic --vitest` lets a user publish the archives that `@chromatic-com/vitest` captures during their Vitest browser tests, with no Storybook of their own. The CLI runs the package's `build-archive-storybook`, which builds the Storybook that ships inside the package around the archives, then uploads it like any other build. With `--only-changed`, TurboSnap traces changed files through the `preview-stats.json` the package's Vitest reporter writes, and TurboSnap 2.0 uploads hashes keyed by the generated `.stories.json` files.

## Sub-features

- `vitest-baseline` publishes the first Vitest build on a fresh branch.
- `vitest-onechange` traces a change in a tested component to the one test that renders it, captures that snapshot and copies the rest.
- `vitest-ts2` uploads TurboSnap 2.0 hashes without the `TurboSnap 2.0 could not find your Storybook config` warning.
- `tsm-vitest` prints the manifest of a Vitest build offline with `chromatic turbosnap-manifest --vitest`.
- `vitest-no-turbosnap` refuses TurboSnap 2.0 when the tests ran without `chromaticPlugin({ turboSnap: true })`, so TurboSnap 1.0 fails the build and asks for it.
- `vitest-pw-cypress` skips TurboSnap 2.0 for `--playwright` and `--cypress`, which report no module graph.

## How to get to it (user POV)

- Add `chromaticPlugin({ turboSnap: true })` from `@chromatic-com/vitest/plugin` to `vitest.config.ts`, run the tests, then run `npx chromatic --vitest [--only-changed]`.
- Run `npx build-archive-storybook --stats-json=storybook-static` then `npx chromatic turbosnap-manifest --vitest` to inspect the manifest.

## Driving it with control-chromatic

Preconditions:

- Everything in `publish-build` preconditions for the networked journeys: backend reachable, token from `CHROMATIC_PROJECT_TOKEN`, disposable project.
- Prepare the fixture with `F=$($S e2e-fixture react-vitest | tail -1)`. Besides the install, `e2e-fixture` runs `npx playwright install chromium` and `npm test` for it, so `$F/.vitest/chromatic` already holds two archives and `preview-stats.json`.
- `$S run` and `$S tty` set `NODE_PATH` to `<cwd>/node_modules`, so `dist/bin.cjs` can find `@chromatic-com/vitest` the way a project-local `chromatic` install would.
- After every `$S commit`, run `(cd "$F" && npm test)` so the archives and stats describe the new commit.

- **Baseline.** Run `$S run vitest-baseline --cwd "$F" -- --vitest --only-changed --exit-zero-on-changes`. Exit code `0`. stdout shows `Running command: node <F>/node_modules/@chromatic-com/vitest/dist/bin/build-archive-storybook.mjs --output-dir=<tmp> --webpack-stats-json=<tmp>` and `Tested 2 tests; captured 2 snapshots`.
- **One change.** Run `sed -i 's/{label}/{label}!/' "$F/src/Button.tsx" && $S commit "$F" "Button change" && (cd "$F" && npm test)`. Run `LOG_LEVEL=debug $S run vitest-onechange --cwd "$F" -- --vitest --only-changed --exit-zero-on-changes`. Exit code `0`. stdout shows `Capturing 1 snapshot; copying 1 snapshot with TurboSnap.` and `Tested 2 tests; captured 1 snapshot`.
- **TurboSnap 2.0.** In the `vitest-onechange` evidence, `grep -a 'could not find your Storybook config' stdout.txt stderr.txt` prints nothing, and stdout has `Uploaded hashes for TurboSnap 2.0 to Chromatic: {…"turboSnapHashBailReason":null}`. The first build after the baseline may say `NO_ANCESTOR_HASHES` instead, if the baseline ran an older CLI.
- **Offline manifest.** Run `(cd "$F" && npx build-archive-storybook --stats-json=storybook-static --output-dir=storybook-static)`, then `$S run tsm-vitest --cwd "$F" -- turbosnap-manifest --vitest`. Exit code `0`. `jq -r '.storybookConfigHashes.storybookVersion' "$EVIDENCE/tsm-vitest/stdout.txt"` is `@chromatic-com/vitest@<installed version>`, and `jq -c '.storyFiles|keys' "$EVIDENCE/tsm-vitest/stdout.txt"` equals `jq -c '[.entries[].importPath]|unique' "$F/storybook-static/index.json"`. Without `--vitest` the command exits `1` with `Error: No Storybook main config file found in <F>/.storybook`.
- **Without `turboSnap: true`.** Run this after the baseline and last. TurboSnap 1.0 only traces on a new commit with an ancestor build, and this step rewrites the archives. Turn the option off, commit, and rebuild: `sed -i 's/chromaticPlugin({ turboSnap: true })/chromaticPlugin()/' "$F/vitest.config.ts" && $S commit "$F" "Turn off turboSnap" && (cd "$F" && rm -rf .vitest storybook-static && npm test && npx build-archive-storybook --stats-json=storybook-static --output-dir=storybook-static)`. `ls "$F/.vitest/chromatic"` lists no `preview-stats.json`.
  - Run `$S run tsm-vitest-no-turbosnap --cwd "$F" -- turbosnap-manifest --vitest`. Exit code `1`. stdout is empty, and stderr is `Error: Found no tracked files behind the story files of this E2E build. For Vitest, make sure you've enabled chromaticPlugin({ turboSnap: true }) in your Vitest configuration before running tests.`
  - Run `LOG_LEVEL=debug $S run vitest-no-turbosnap --cwd "$F" -- --vitest --only-changed --exit-zero-on-changes`. Exit code `254`. stdout shows `found 1 parent build and 1 changed file`. stderr has `Failed to build manifest for TurboSnap 2.0 Found no tracked files behind the story files …`, `grep -a 'Uploaded hashes' stdout.txt` prints nothing, and stdout ends with `✖ TurboSnap failed` and `Make sure you've enabled chromaticPlugin({ turboSnap: true }) in your test Vitest configuration before running tests.`
  - Restore the fixture: `sed -i 's/chromaticPlugin()/chromaticPlugin({ turboSnap: true })/' "$F/vitest.config.ts" && $S commit "$F" "Turn on turboSnap" && (cd "$F" && rm -rf .vitest storybook-static && npm test)`.
- **Playwright and Cypress.** There is no fixture for them yet. Only the unit tests in `node-src/lib/turbosnap/index.test.ts` cover `vitest-pw-cypress`; say so when reporting.
- **Proof.** Keep `stdout.txt`, `stderr.txt` and `exit_code` for each label, and copy the written manifest into the label dir: with `LOG_LEVEL=debug`, its path is on the `Wrote manifest for TurboSnap 2.0 to …` line.

## Gotchas

- The stats under `.vitest/chromatic/preview-stats.json` list test files but no story-entry module, so `turbosnap-manifest --vitest -s .vitest/chromatic/preview-stats.json` exits `1` with `Error: Found no story files in the stats file …`. Use the stats `build-archive-storybook --stats-json` writes, which the CLI does itself on a real build.
- `@chromatic-com/vitest` numbers `.stories.json` files in the order tests finish, so the same test can be `src-badge-1` on one run and `src-badge-2` on the next. TurboSnap 2.0 then sees a different story key and recaptures it. Do not report that as a CLI bug.
- `--storybook-base-dir` must be the directory the tests ran in, because the reporter names paths relative to it. Anywhere else, TurboSnap 2.0 finds no story files and uploads nothing (see `tsm-no-stories` in `turbosnap-manifest`).
- Running the main command without `NODE_PATH` (outside `$S run`/`$S tty`) fails with `Failed to import @chromatic-com/vitest, is it installed in package.json?`, because the bundle resolves packages from its own location.
- Without `turboSnap: true`, a build where TurboSnap 1.0 is disabled exits `0` and captures every snapshot, while TurboSnap 2.0 still refuses. That happens on the first build of a branch, and on a rebuild of a commit that already has a passed build (stdout: `found 1 parent build; TurboSnap disabled`). Commit before the build to see the `254`.
- A copy of the fixture made with `cp -r` keeps stats naming the original path. Rerun `npm test` in the copy.

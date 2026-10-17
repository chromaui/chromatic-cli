# Publish a build

The main `chromatic` command lets a user publish a Storybook to Chromatic and start a visual test build. It authenticates with the project token, gathers git info, reads or builds the Storybook, announces a build, uploads files, verifies the published Storybook, and waits for snapshots. It exits with a code that reflects the build result. This is the CLI's core journey, and it needs the real backend.

## Sub-features

- `pub-prebuilt` publishes an already-built Storybook (`--storybook-build-dir`) and starts a build.
- `pub-exit-once-uploaded` exits `0` as soon as the Storybook is published (`--exit-once-uploaded`).
- `pub-dry-run` authenticates and announces, but skips upload, verify and snapshot (`--dry-run`).
- `pub-skip` marks the commit as passing without testing (`--skip`).
- `pub-junit` writes a JUnit XML of the build results (`--junit-report`).

## How to get to it (user POV)

- Run `npx chromatic --project-token <token>` in a project with a `build-storybook` script.
- Run `npx chromatic -t <token> --storybook-build-dir storybook-static` after building Storybook yourself.
- Set `CHROMATIC_PROJECT_TOKEN` and run `yarn chromatic` in this repo, which publishes the repo's own stories.
- Run the GitHub Action `chromaui/action`. That entry point is not mapped here.

## Driving it with control-chromatic

Preconditions:

- `$S doctor` exits 0 and reports `INFO backend … reachable` and `INFO CHROMATIC_PROJECT_TOKEN is set`.
- The token belongs to a disposable or test project, or `CHROMATIC_INDEX_URL=https://index.staging-chromatic.com` is exported with a staging token. Every journey except `pub-skip` creates a real build that cleanup cannot remove.
- `$SB_DIR` holds this run's Storybook build.
- Drive from the repo root, which is a git repo with commits. The CLI reads branch and commit from cwd.

- **Prebuilt publish.** Run `$S run pub-prebuilt -- --storybook-build-dir "$SB_DIR" --exit-zero-on-changes --skip-update-check --diagnostics-file "$EVIDENCE/pub-prebuilt/d.json" --log-file "$EVIDENCE/pub-prebuilt/chromatic.log"`. Exit code `0`. stdout shows `Authenticating with Chromatic`, `Started build <N>` and `View build details at <webUrl>`. `jq '.build.number, .build.webUrl' d.json` match stdout. The build appears in the project's Builds list at that URL.
- **Exit once uploaded.** Run `$S run pub-exit-once-uploaded -- --storybook-build-dir "$SB_DIR" --exit-once-uploaded --skip-update-check`. Exit code `0`. stdout shows `Published your Storybook` and a Storybook URL, then exits without waiting for snapshots.
- **Dry run.** Run `$S run pub-dry-run -- --storybook-build-dir "$SB_DIR" --dry-run --skip-update-check --log-file "$EVIDENCE/pub-dry-run/chromatic.log"`. The upload, verify and snapshot steps each read `Skipped due to --dry-run`. The log still shows `Connecting to https://index.chromatic.com` (or your `CHROMATIC_INDEX_URL`).
- **Skip.** Run `$S run pub-skip -- --skip --skip-update-check`. Exit code `0`. stdout says the build was skipped and the commit marked as passing. No upload happens.
- **JUnit.** Run `$S run pub-junit -- --storybook-build-dir "$SB_DIR" --exit-zero-on-changes --skip-update-check --junit-report "$EVIDENCE/pub-junit/build-{buildNumber}.xml"`. A file `build-<N>.xml` exists in that dir with a `<testsuite>` per spec.
- **Proof.** For each label keep the command, both streams, the exit code, diagnostics and log. Also keep the build URL from stdout as the external side effect.

## Gotchas

- Unverified here. Every journey in this file was written from the CLI's messages and source, but never executed. The 2026-10-17 proof environment's egress policy blocks `index.chromatic.com` and `www.chromatic.com`, and the CLI fails with `HTTPClient failed to fetch https://index.chromatic.com/graphql, got 403/Forbidden`, exit `255`. The first run with a reachable backend must confirm or correct every expected string, especially the `pub-skip` wording and the `d.json` field paths.
- `--dry-run` still authenticates and announces a build to the backend. Only upload, verify and snapshot are skipped. It is not offline, and it is not side-effect free.
- Without `--exit-zero-on-changes`, a build with visual changes exits `1` (`BUILD_HAS_CHANGES`). That is a correct result, not a failed journey. Read `exitCodeKey` in diagnostics.
- Without `--storybook-build-dir`, the CLI runs the `build-storybook` script. In this repo that script fails when stdin is `/dev/null` (see SKILL.md Launch). `$S run` pipes stdin, but `$S tty` is safer for that path.
- Never put the token on the command line in reported evidence. Export `CHROMATIC_PROJECT_TOKEN`, and `command.txt` will not contain it.
- `--patch-build`, `--only-changed` and `--auto-accept-changes` change baselines on the real project. Do not exercise them against a shared project.

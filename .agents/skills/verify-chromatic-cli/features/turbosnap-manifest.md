# TurboSnap manifest

`chromatic turbosnap-manifest` lets a user build the TurboSnap v2 manifest from a Storybook stats file. The manifest hashes every bundled file on disk and attributes files to story files. It prints the manifest as JSON on stdout and writes nothing to disk. It works offline.

## Sub-features

- `tsm-default` prints a manifest with the top-level keys `attribution`, `configAnalysis`, `externals`, `files`, `skippedFiles`, `staticFiles`, `storyFiles`, `storybookConfigFiles`, `storybookConfigHashes` and `storybookHash`.
- `tsm-config-analysis` reports config roles, verified build inputs and the reason for selective or directory-wide coverage.
- `tsm-config-selective` scopes verified story-only config helpers to their dependent stories.
- `tsm-config-fallback` retains the legacy sweep when producer metadata is unavailable, incomplete or stale.
- `tsm-config-untraced` preserves explicit config exclusions.
- `tsm-externals` records hashes for repo files that match an `--externals` glob.
- `tsm-static` records hashes for files under `--static-dir` directories.
- `tsm-missing-stats` fails with a clear message and exit `1` when the stats file is missing.

## How to get to it (user POV)

- Run `chromatic turbosnap-manifest` from the Storybook project root after `storybook build --stats-json`.
- Run `chromatic turbosnap-manifest -s <stats> [--externals <glob>] [--static-dir a,b] [-u <glob>]` to customize it.

## Driving it with control-chromatic

Preconditions:

- `$S doctor` exits 0, and `$SB_STATS` exists for this `RUN_ID`.
- Drive from the repo root. Globs are relative to the repo root.

- **Default manifest.** Run `$S run tsm-default -- turbosnap-manifest -s "$SB_STATS"`. Exit code `0`. Then run `jq -c 'keys' "$EVIDENCE/tsm-default/stdout.txt"`, which prints the ten keys listed above. `jq '.storyFiles|length'` is greater than `0`. Every `.storyFiles` value is a 16-hex-char hash.
- **Config analysis.** Run `$S run tsm-config-analysis -- turbosnap-manifest -s "$SB_STATS"`. Exit code `0`. `jq '.configAnalysis' "$EVIDENCE/tsm-config-analysis/stdout.txt"` has a mode/reason and sorted `entryFiles`, `globalFiles`, `storyScopedCandidates`, `unattributedFiles`, `buildFiles` arrays. The first four categories partition the original config sweep. In `dependencies` mode candidates are absent from the final `storybookConfigFiles`; in `directory` mode their union equals its keys.
- **Selective config coverage.** In a disposable fixture using the matching producer's supported HTML/Vite profile, with two stories and a `.storybook/fixture.json` imported by only one, build fresh stats. Run `$S run tsm-config-selective-before --cwd "$FIXTURE" -- turbosnap-manifest`. Exit `0`, mode `dependencies`, reason `verified-build-dependencies`; global hashes include `buildConfiguration` and `configDependencyVersion`. Edit only the fixture JSON, rebuild Storybook, then run `$S run tsm-config-selective-after --cwd "$FIXTURE" -- turbosnap-manifest`. Only its dependent story hash changes; every global hash remains equal. Changing main or a tracked compiler config and rebuilding must change global coverage.
- **Stale evidence.** After the baseline above, edit the helper without rebuilding Storybook. Run `$S run tsm-config-fallback --cwd "$FIXTURE" -- turbosnap-manifest`. Mode is `directory`, reason is `stale-build-dependencies`, and no `configDependencyVersion` key exists. The helper remains in `storybookConfigFiles`. Missing/unsupported metadata has the same coverage with its corresponding reason.
- **Explicit exclusions.** With fresh supported fixture stats, run `$S run tsm-config-untraced --cwd "$FIXTURE" -- turbosnap-manifest -u '.storybook/**'`. Existing exclusions remain visible in `skippedFiles`; main remains in `storybookConfigFiles`, and mode is `directory` because the build dependency is excluded. Compare against the same stats with producer metadata omitted to prove identical legacy hashes.
- **No disk writes.** Before and after the run, `ls "$SB_DIR"` and `git -C "$REPO" status --short` are identical.
- **Externals.** Run `$S run tsm-externals -- turbosnap-manifest -s "$SB_STATS" --externals 'node-src/lib/log.ts'`. Exit code `0`. `jq -c '.externals' "$EVIDENCE/tsm-externals/stdout.txt"` is `{"./node-src/lib/log.ts":"<16-hex hash>"}`.
- **Static dir.** Run `$S run tsm-static -- turbosnap-manifest -s "$SB_STATS" --static-dir static`. Exit code `0`. `jq -c '.staticFiles|keys' "$EVIDENCE/tsm-static/stdout.txt"` includes `./static/css/global.css`.
- **Missing stats.** Run `$S run tsm-missing-stats -- turbosnap-manifest -s "$WORK/nope.json"`. Exit code `1`. stdout or stderr starts with `No stats file at <path>/nope.json`, followed by the usage text.
- **Proof.** The `$EVIDENCE/tsm-*` dirs hold the JSON on stdout. Keep the `jq` outputs above with them: `jq -c 'keys' … > "$EVIDENCE/tsm-default/keys.txt"`.

## Gotchas

- The manifest is large. `$S run` prints only the first 40 lines, so always inspect `stdout.txt` with `jq`.
- `--externals 'static/*.css'` matches nothing here because the CSS lives in `static/css/`. An empty `{}` usually means a glob that is too narrow, not a bug.
- `-u/--untraced` with a story-local glob did not change `storyFiles` or `skippedFiles` counts in this repo. Do not cite that as proof of untraced behavior without a case that changes the output.
- Hashes come from files on disk, not the stats. To prove a hash changes, edit only a file with no uncommitted changes (`git -C "$REPO" status --short -- <file>` prints nothing), so restoring it with `git -C "$REPO" checkout -- <file>` afterward discards only your edit.

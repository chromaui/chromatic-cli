# TurboSnap manifest

`chromatic turbosnap-manifest` lets a user build the TurboSnap v2 manifest from a Storybook stats file. The manifest hashes every bundled file on disk and attributes files to story files. It prints the manifest as JSON on stdout and writes nothing to disk. It works offline.

## Sub-features

- `tsm-default` prints a manifest with the top-level keys `attribution`, `configAnalysis`, `externals`, `files`, `skippedFiles`, `staticFiles`, `storyFiles`, `storybookConfigFiles`, `storybookConfigHashes` and `storybookHash`, plus optional `configCoverage` when output evidence is verified.
- `tsm-config-analysis` reports config roles, output-evidence availability and the reason for fallback.
- `tsm-config-selective` supplies a conditional ancestor comparison while retaining legacy source hashes.
- `tsm-config-fallback` retains the legacy sweep when producer metadata is unavailable, incomplete or stale.
- `tsm-config-boundary` rejects source/output bindings outside their independent roots and retains legacy coverage.
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

- **Default manifest.** Run `$S run tsm-default -- turbosnap-manifest -s "$SB_STATS"`. Exit code `0`. Then run `jq -c 'keys' "$EVIDENCE/tsm-default/stdout.txt"`, which includes the ten required keys above and may also include `configCoverage`. `jq '.storyFiles|length'` is greater than `0`. Every `.storyFiles` value is a 16-hex-char hash.
- **Config analysis.** Run `$S run tsm-config-analysis -- turbosnap-manifest -s "$SB_STATS" --storybook-build-dir "$SB_DIR"`. `configAnalysis` contains a mode/reason and sorted `entryFiles`, `globalFiles`, `storyScopedCandidates`, and `unattributedFiles`. These partition the full config sweep in both modes.
- **Conditional config coverage.** Use actual disposable React-Vite, React-Webpack5, Nextjs-Vite and Nextjs-Webpack Storybooks with two independent stories, CSS/static assets and a `.storybook/fixture.json` imported by one story. Build fresh stats and run the shipped CLI before/after changing that helper. Mode is `output`, reason `verified-output-evidence`, and `configCoverage` exists. The original config hash and dependent story hash change; the unrelated source-story hash, `stableConfigHash`, global output hash, and unrelated output-story hash remain equal. Candidates remain in the full `storybookConfigFiles`. A backend ancestor comparison is necessary to verify the actual capture decision.
- **Hidden effects.** Make a compiler/plugin read the helper and change another story's generated output. That story's output hash must change or evidence must fall back. A preview/global output change must change global output coverage or fall back.
- **Stale evidence.** Edit the helper or emitted output without rebuilding. The manifest uses `directory` mode, lacks `configCoverage`, and retains legacy hashes. Also test missing/added output files and incomplete metadata.
- **Explicit exclusions.** With fresh stats, run with `-u '.storybook/**'`. Existing exclusions remain visible in `skippedFiles`, and main remains in the sweep. Compare source-story and global source hashes against the same stats with producer metadata omitted; they must be identical. After an excluded-only edit/rebuild they remain equal even if output evidence changes.
- **Filesystem boundaries.** Add a binding for a harmless file outside the Git root, then an output binding outside the independent build root. Both must fall back without reading the external contents. Repeat with escaping symlinks. Use `--stats-file` and `--storybook-build-dir` independently for custom paths.
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

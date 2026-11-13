# TurboSnap manifest

`chromatic turbosnap-manifest` lets a user build the TurboSnap v2 manifest from a Storybook stats file. The manifest hashes every bundled file on disk and attributes files to story files. It prints the manifest as JSON on stdout and writes nothing to disk. It works offline.

## Sub-features

- `tsm-default` prints a manifest with the top-level keys `attribution`, `externals`, `files`, `skippedFiles`, `staticFiles`, `storyFiles`, `storybookConfigFiles`, `storybookConfigHashes` and `storybookHash`.
- `tsm-externals` records hashes for repo files that match an `--externals` glob.
- `tsm-static` records hashes for files under `--static-dir` directories.
- `tsm-missing-stats` fails with a clear message and exit `1` when the stats file is missing.
- `tsm-mono` builds a manifest for a monorepo package with `-b`, including externals outside it.
- `tsm-no-stories` fails with exit `1` when the stats resolve to no story files from the project root, instead of printing a manifest with an empty `storyFiles`.

## How to get to it (user POV)

- Run `chromatic turbosnap-manifest` from the Storybook project root after `storybook build --stats-json`.
- Run `chromatic turbosnap-manifest -s <stats> [--externals <glob>] [--static-dir a,b] [-u <glob>]` to customize it.

## Driving it with control-chromatic

Preconditions:

- `$S doctor` exits 0, and `$SB_STATS` exists for this `RUN_ID`.
- Drive from the repo root. Globs are relative to the repo root.

- **Default manifest.** Run `$S run tsm-default -- turbosnap-manifest -s "$SB_STATS"`. Exit code `0`. Then run `jq -c 'keys' "$EVIDENCE/tsm-default/stdout.txt"`, which prints the nine keys listed above. `jq '.storyFiles|length'` is greater than `0`. Every `.storyFiles` value is a 16-hex-char hash.
- **No disk writes.** Before and after the run, `ls "$SB_DIR"` and `git -C "$REPO" status --short` are identical.
- **Externals.** Run `$S run tsm-externals -- turbosnap-manifest -s "$SB_STATS" --externals 'node-src/lib/log.ts'`. Exit code `0`. `jq -c '.externals' "$EVIDENCE/tsm-externals/stdout.txt"` is `{"./node-src/lib/log.ts":"<16-hex hash>"}`.
- **Static dir.** Run `$S run tsm-static -- turbosnap-manifest -s "$SB_STATS" --static-dir static`. Exit code `0`. `jq -c '.staticFiles|keys' "$EVIDENCE/tsm-static/stdout.txt"` includes `./static/css/global.css`.
- **Missing stats.** Run `$S run tsm-missing-stats -- turbosnap-manifest -s "$WORK/nope.json"`. Exit code `1`. stdout is empty, and stderr starts with `Error: No stats file at <path>/nope.json`, followed by the usage text.
- **Monorepo project root.** Reuse the `monorepo-pnpm` copy and Storybook from `trace-mono` (`F=$WORK/e2e-monorepo-pnpm`), or prepare and build one as described there (see `trace`). Run `$S run tsm-mono --cwd "$F" -- turbosnap-manifest -b packages/ui -s storybook-static/preview-stats.json --externals 'packages/backend/**'`. Exit code `0`. `-s` is resolved against `packages/ui`. `jq -c '.storyFiles|keys'` is `["./src/Badge.stories.tsx","./src/Button.stories.tsx"]`, and `jq -c '.externals|keys'` is `["../backend/package.json","../backend/src/index.ts"]`: keys are relative to the project root, with `../` for files outside it.
- **No story files.** In the same `monorepo-pnpm` copy, point the project root at the repository root, where the stats paths don't resolve: `$S run tsm-no-stories --cwd "$F" -- turbosnap-manifest -b . -s packages/ui/storybook-static/preview-stats.json -c packages/ui/.storybook`. Exit code `1`. stdout is empty, and stderr is `Error: Found no story files in the stats file for the project at <F>. Either Storybook was built in another directory (pass --storybook-base-dir <dir> pointing at it), or its builder names its stories entry in a way TurboSnap doesn't recognize.` On a real `--only-changed` build with the same mistake, debug logs show `Failed to build manifest for TurboSnap 2.0 Found no story files …` and no `Uploaded hashes` line, and TurboSnap 1.0 fails the build with exit `254` and `✖ TurboSnap disabled until base directory is set correctly`.
- **Proof.** The `$EVIDENCE/tsm-*` dirs hold the JSON on stdout. Keep the `jq` outputs above with them: `jq -c 'keys' … > "$EVIDENCE/tsm-default/keys.txt"`.

## Gotchas

- `-s` resolves against the project root (`-b`, else cwd), but `trace -s` resolves against cwd. Running from a monorepo root without `-b` fails with exit `1`, as long as `STORYBOOK_BASE_DIR` is unset; when it is set, it stands in for `-b` and moves where `-s` and the config dir resolve. In `monorepo-pnpm`, with no `-s` the error is `Error: No stats file at <root>/storybook-static/preview-stats.json` followed by the usage text. With `-s packages/ui/storybook-static/preview-stats.json` the error is `Error: No Storybook main config file found in <root>/.storybook`, the same message a wrong `-c` gives.
- The manifest is large. `$S run` prints only the first 40 lines, so always inspect `stdout.txt` with `jq`.
- `--externals 'static/*.css'` matches nothing here because the CSS lives in `static/css/`. An empty `{}` usually means a glob that is too narrow, not a bug.
- `-u/--untraced` with a story-local glob did not change `storyFiles` or `skippedFiles` counts in this repo. Do not cite that as proof of untraced behavior without a case that changes the output.
- Files git doesn't track are skipped, not hashed (CAP-5348), whether or not `.gitignore` matches them. A new, uncommitted file a story imports appears in `.skippedFiles` as `"untracked"` and in `.files` with `"hash":"<skipped>"`, so editing it never changes the manifest. Commit it (or, in the repo, use an existing tracked file) before proving a hash change. A tracked file with uncommitted edits is still hashed.
- Hashes come from files on disk, not the stats. To prove a hash changes, edit only a file with no uncommitted changes (`git -C "$REPO" status --short -- <file>` prints nothing), so restoring it with `git -C "$REPO" checkout -- <file>` afterward discards only your edit.

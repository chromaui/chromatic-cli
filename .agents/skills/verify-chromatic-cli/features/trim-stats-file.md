# Trim stats file

`chromatic trim-stats-file` lets a user shrink a Storybook `preview-stats.json` to user-code modules and their reasons, so the file can be read or shared for TurboSnap debugging. It writes `<name>.trimmed.json` next to the input and prints `Wrote <path>`.

## Sub-features

- `trim-explicit` trims a stats file passed as a positional argument.
- `trim-default-path` trims `./storybook-static/preview-stats.json` in cwd when no argument is given.
- `trim-missing` prints an ENOENT error for a missing input and still exits `0`.

## How to get to it (user POV)

- Run `chromatic trim-stats-file path/to/preview-stats.json`.
- Run `chromatic trim-stats-file` from a directory that has `storybook-static/preview-stats.json`.
- Run `yarn trim-stats` in this repo, which is a package script.

## Driving it with control-chromatic

Preconditions:

- `$S doctor` exits 0, and `$SB_STATS` exists for this `RUN_ID`.
- No `$SB_DIR/preview-stats.trimmed.json` exists yet. Delete it with `rm -f`.

- **Explicit path.** Run `$S run trim-explicit -- trim-stats-file "$SB_STATS"`. Exit code `0`. stdout is `Wrote <SB_DIR>/preview-stats.trimmed.json`.
- **Side effect.** Copy the file and inspect it. Run `cp "$SB_DIR/preview-stats.trimmed.json" "$EVIDENCE/trim-explicit/"`, then `jq -c 'keys' "$EVIDENCE/trim-explicit/preview-stats.trimmed.json"`, which prints `["modules"]`. Compare `jq '.modules|length'` on both files: the trimmed count is lower. It went from 407 to 255 on 2026-10-17. No `jq -r '.modules[].name'` entry contains `node_modules/`.
- **Default path.** Run from the run's work dir, whose `storybook-static/` is `$SB_DIR`. Run `$S run trim-default-path --cwd "$WORK" -- trim-stats-file`. Exit code `0`. stdout is `Wrote ./storybook-static/preview-stats.trimmed.json`.
- **Missing input.** Run `$S run trim-missing -- trim-stats-file "$WORK/nope.json"`. Exit code `0`, which is misleading. The output contains `ENOENT: no such file or directory, open '<path>/nope.json'`. No `Wrote` line appears, and no `nope.trimmed.json` exists.

## Gotchas

- Exit code is `0` on every failure. Proof must show the `Wrote …` line and the file. Absence of the line means failure.
- `trim-stats-file --help` is not help. It treats `--help` as the input path and prints `ENOENT … open '--help'`.
- Output lands next to the input, never in cwd. Never point it at the repo's `storybook-static/` during verification. Use `$SB_STATS`.
- The output name is built by replacing the first `.json` in the path. A directory name that contains `.json` would be rewritten instead of the file name.

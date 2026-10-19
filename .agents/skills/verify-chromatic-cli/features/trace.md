# Trace changed files to stories

`chromatic trace` lets a user list changed files and see which story files TurboSnap would consider affected. It reads a Storybook `preview-stats.json` and prints a dependency trace. It works fully offline.

## Sub-features

- `trace-default` traces a changed file to its story file with a tree view.
- `trace-compact` prints a flat list of affected story files (`-m compact`).
- `trace-expanded` adds the project root, base and config dirs and underlying modules (`-m expanded`).
- `trace-nomatch` reports zero affected story files for a file outside the bundle.
- `trace-missing-stats` fails clearly when the stats file does not exist.

## How to get to it (user POV)

- Run `chromatic trace <changed files...>` from the Storybook project root.
- Run `npx chromatic trace -s path/to/preview-stats.json <changed files...>` with a custom stats path.
- Run `yarn trace <files>` in this repo, which is a package script for `./dist/bin.cjs trace`.

## Driving it with control-chromatic

Preconditions:

- `$S doctor` exits 0, and `$SB_STATS` exists for this `RUN_ID`.
- Drive from the repo root, the default `--cwd`. Paths are relative to it.
- `node-src/ui/messages/errors/missingProjectToken.ts` exists and has a sibling `missingProjectToken.stories.ts`.

- **Default trace.** Trace one changed message module. Run `$S run trace-default -- trace -s "$SB_STATS" node-src/ui/messages/errors/missingProjectToken.ts`. Exit code `0`. stdout starts with `ℹ Traced 1 changed file to 1 affected story file:`, then `— node-src/ui/messages/errors/missingProjectToken.ts [changed]`, then `∟ node-src/ui/messages/errors/missingProjectToken.stories.ts`, then `∟ [story index]`.
- **Compact mode.** Run `$S run trace-compact -- trace -s "$SB_STATS" -m compact node-src/ui/messages/errors/missingProjectToken.ts`. Exit code `0`. stdout lists `— node-src/ui/messages/errors/missingProjectToken.stories.ts` and has no `[changed]` tree line.
- **Expanded mode.** Run `$S run trace-expanded -- trace -s "$SB_STATS" -m expanded node-src/ui/messages/errors/missingProjectToken.ts`. Exit code `0`. stdout contains `The root directory of your project: <repo root>`, `The storybook directory … .storybook`, and `File Path: node-src/ui/messages/errors/missingProjectToken.stories.ts`.
- **No match.** Trace a module no story imports. Run `$S run trace-nomatch -- trace -s "$SB_STATS" does/not/exist.ts`. Exit code `0`. stdout says `ℹ Traced 1 changed file to 0 affected story files:`.
- **Missing stats.** Run `$S run trace-missing-stats -- trace -s "$WORK/nope.json" x.ts`. Exit code `1`. Output contains `ENOENT: no such file or directory, open '<path>/nope.json'`.
- **Proof.** The five `$EVIDENCE/trace-*` dirs each hold `command.txt`, `stdout.txt`, `stderr.txt` and `exit_code` with the values above. Check them with `head -3 "$EVIDENCE"/trace-*/stdout.txt; cat "$EVIDENCE"/trace-*/exit_code`.

## Gotchas

- Without `-s`, trace reads `storybook-static/preview-stats.json` in cwd. That is the repo's shared build dir and may be stale or missing. Always pass `-s "$SB_STATS"`.
- Changed-file paths are relative to the repo root (cwd). A `./` prefix works. An absolute path silently produces 0 matches. A 0-match result is only a pass for `trace-nomatch`.
- An unknown file exits `0` with 0 affected stories, not an error. Do not treat exit `0` as proof of a match.
- Output is colored only on a TTY. `$S run` output is plain text, so assert on it there.
- Stats reflect the Storybook as it was built. After editing stories or imports, run `$S rebuild --storybook` before tracing.

# Trace changed files to stories

`chromatic trace` lets a user list changed files and see which story files TurboSnap would consider affected. It reads a Storybook `preview-stats.json` and prints a dependency trace. It works fully offline.

## Sub-features

- `trace-default` traces a changed file to its story file with a tree view.
- `trace-compact` prints a flat list of affected story files (`-m compact`).
- `trace-expanded` adds the project root, base and config dirs and underlying modules (`-m expanded`).
- `trace-nomatch` reports zero affected story files for a file outside the bundle.
- `trace-missing-stats` fails clearly when the stats file does not exist.
- `trace-pkgjson` refuses to trace a `package.json`.
- `trace-wp` and `trace-mono` trace webpack stats and a monorepo workspace package from the e2e fixtures.
- `trace-abs` traces an absolute changed-file path the same as its repo-relative form.

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
- **Missing stats.** Run `$S run trace-missing-stats -- trace -s "$WORK/nope.json" x.ts`. Exit code `1`. stdout is empty, and stderr is `Error: ENOENT: no such file or directory, open '<path>/nope.json'`.
- **Package manifest.** Run `$S run trace-pkgjson -- trace -s "$SB_STATS" package.json`. Exit code `1`. Output contains `Error: Unable to trace package manifest file (package.json) as that would require diffing file contents.`
- **Webpack stats.** Webpack names concatenated modules, which the Vite repo Storybook never produces. Run `F=$($S e2e-fixture react-webpack5 | tail -1) && (cd "$F" && : | npx storybook build --stats-json)`, then `$S run trace-wp --cwd "$F" -- trace -m compact src/Badge.tsx`. Exit code `0`. stdout is `ℹ Traced 1 changed file to 2 affected story files:`, `— src/Badge.stories.tsx` and `— src/Button.stories.tsx + 1 modules`.
- **Absolute path.** In the same copy, run `$S run trace-abs --cwd "$F" -- trace -m compact "$F/src/Badge.tsx"`. Exit code `0`, and stdout lists the same 2 affected story files as `trace-wp` (CAP-5323). An absolute path outside the repo, such as `/etc/hosts`, exits `0` with 0 affected story files.
- **Monorepo workspace package.** Run `F=$($S e2e-fixture monorepo-pnpm | tail -1) && (cd "$F/packages/ui" && : | npx storybook build --stats-json)`, then `$S run trace-mono --cwd "$F" -- trace -b packages/ui -s packages/ui/storybook-static/preview-stats.json packages/shared/src/index.ts`. Exit code `0`. The tree is `packages/shared/src/index.ts [changed]` → `packages/ui/src/Button.tsx` → `packages/ui/src/Button.stories.tsx` → `[story index]`, which shows that the workspace symlink resolves to the package source.
- **Proof.** The `$EVIDENCE/trace-*` dirs each hold `command.txt`, `stdout.txt`, `stderr.txt` and `exit_code` with the values above. Check them with `head -3 "$EVIDENCE"/trace-*/stdout.txt; cat "$EVIDENCE"/trace-*/exit_code`.

## Gotchas

- Without `-s`, trace reads `storybook-static/preview-stats.json` in cwd. That is the repo's shared build dir and may be stale or missing. Always pass `-s "$SB_STATS"`.
- Relative changed-file paths are relative to the git root, not cwd. Only `-s` is relative to cwd. In a monorepo fixture this means `packages/shared/src/index.ts`, even when you run from `packages/ui`. A `./` prefix works, and absolute paths inside the repo work too (CAP-5323; older CLIs silently produced 0 matches for them). A 0-match result is only a pass for `trace-nomatch`.
- `.env` and exported `WEBPACK_STATS_FILE`, `STORYBOOK_BASE_DIR` and `STORYBOOK_CONFIG_DIR` silently change the defaults. The usage line advertises `-b|--base-dir` and `-c|--config-dir`, but the long flags are really `--storybook-base-dir` and `--storybook-config-dir`, and an unknown long flag is ignored silently.
- An unknown file exits `0` with 0 affected stories, not an error. Do not treat exit `0` as proof of a match.
- Output is colored only on a TTY. `$S run` output is plain text, so assert on it there.
- Stats reflect the Storybook as it was built. After editing stories or imports, run `$S rebuild --storybook` before tracing.

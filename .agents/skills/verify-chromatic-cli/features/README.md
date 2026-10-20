# Chromatic CLI verification map

This directory is the maintained source for verifying the user-facing behavior of the Chromatic CLI. Read this index before driving the CLI, then use the matching feature file as the recipe.

## Baseline preconditions

- Work from the chromatic-cli repo root with `S=.agents/skills/verify-chromatic-cli/scripts/control-chromatic`.
- Set a fresh `RUN_ID` per run, for example `export RUN_ID=verify-$(date +%s)`, so concurrent runs do not share `$WORK` or tmux sessions.
- Run `$S setup` once per `RUN_ID`, then `eval "$($S env)"`.
- `$S doctor` exits 0. It must report a matching `dist/bin.cjs --version`, a fresh `dist/`, and this run's `$SB_STATS`.
- Main-command journeys run in `$FIXTURE`, created by `$S fixture`. Subcommand journeys run from the repo root.
- `publish-build` additionally needs `doctor` to report the backend as reachable and `CHROMATIC_PROJECT_TOKEN` as set, with a disposable project's token.

## Driving conventions

- Drive only `dist/bin.cjs`, through `$S run` (non-TTY) or `$S tty` (TTY). Never call `node-src` functions.
- Treat every argument after `--` as literal. Keep quoted globs and flags unchanged.
- Use one evidence label per journey, named after the sub-feature ID, for example `trace-default`.
- Read the CLI's JSON output with `jq`. Do not grep for JSON structure.
- Never write CLI side files (`chromatic.log`, diagnostics, `chromatic.config.json`, trimmed stats) into the repo checkout. Use `$FIXTURE`, `$WORK` or `$EVIDENCE`.
- Restore any fixture file you mutate. `$S fixture` recreates the fixture from scratch.
- Never commit on, reset, or check out over the developer's branch. Journeys that need commits run in `$CHECKOUT` from `$S checkout`, which `$S cleanup` removes.

## Proof and skip reporting

- CLI proof includes `command.txt`, `stdout.txt`, `stderr.txt` (or `pane.txt` for TTY), and `exit_code`.
- Pair every exit code with the message or file that explains it. `trim-stats-file` exits 0 on failure.
- File-writing proof includes the written file copied into the evidence label dir and a read-only inspection of it with `jq`, `wc` or `ls`.
- Record the feature ID and entry point with every artifact. The evidence label carries the ID.
- Report an unreachable path with the attempted command and the unmet precondition. A blocked backend is a precondition failure, not a pass.
- Do not report a skipped entry point as verified through a different path. A `--dry-run` result never stands in for a publish.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with control-chromatic` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Trace changed files to stories](./trace.md) covers `chromatic trace` in default, compact and expanded modes, the no-match case, and a missing stats file.
- [TurboSnap manifest](./turbosnap-manifest.md) covers `chromatic turbosnap-manifest`, its JSON shape, and the `--externals` and `--static-dir` options.
- [Trim stats file](./trim-stats-file.md) covers `chromatic trim-stats-file` output placement and its misleading exit code on failure.
- [Preflight and configuration](./preflight-and-config.md) covers the main command's offline option validation, the config file, and diagnostics and log files.
- [Publish a build](./publish-build.md) covers the networked main command: prebuilt publish, exit once uploaded, dry run, skip, and JUnit report. It needs a token and a reachable backend.
- [TurboSnap on a real build](./turbosnap-only-changed.md) covers `--only-changed` against a real baseline: a fully skipped build, one changed story file, the strict exit code, `--trace-changed`, the automatic metadata upload, and the same-commit rebuild fallback. It needs a token, a reachable backend, and a local-only commit.

Not yet mapped: `chromatic init`, `generate-manifest`, `react-native-build`, the GitHub Action (`action.yml`), and `--untraced`/`--externals` on a real TurboSnap build.

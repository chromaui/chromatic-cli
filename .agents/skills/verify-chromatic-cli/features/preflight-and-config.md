# Preflight and configuration

Before the main `chromatic` command touches the network, it resolves flags, env vars and `chromatic.config.json`. It rejects invalid combinations with a clear message and a specific exit code. It can also write a diagnostics JSON and a log file that show the resolved options. Every journey here is observable offline, except where a valid setup proceeds to `Authenticating`.

## Sub-features

- `pre-no-package` refuses to run outside a JS project (exit `253`).
- `pre-no-token` requires a project token (exit `254`, `✖ Missing project token`).
- `pre-incompatible` rejects incompatible flag pairs (exit `254`, `✖ Incompatible options: …`).
- `cfg-loaded` loads `chromatic.config.json` and merges it into options.
- `cfg-invalid` rejects unknown keys or wrong types in a config file (exit `254`).
- `cfg-unparseable` rejects malformed JSON in a config file (exit `254`).
- `cfg-missing` rejects a `--config-file` path that does not exist (exit `254`).
- `diag-files` writes `--diagnostics-file` and `--log-file` with tokens redacted.
- `pre-tty` renders the same preflight error in an interactive terminal.

## How to get to it (user POV)

- Run `npx chromatic` (or `chromatic --project-token <t> [flags]`) in a project directory.
- Put options in `chromatic.config.json` (also `.jsonc` or `.json5`) or pass `--config-file <path>`.
- Set `CHROMATIC_PROJECT_TOKEN` instead of `-t`.

## Driving it with control-chromatic

Preconditions:

- `$S doctor` exits 0.
- `$S fixture` has just run, so `$FIXTURE` has only `package.json` and one git commit, and no `chromatic.config.json`.
- `CHROMATIC_PROJECT_TOKEN` is unset in your shell for these journeys. Use `env -u CHROMATIC_PROJECT_TOKEN $S run …` if needed.

- **No package.json.** Run in an empty dir. Run `mkdir -p "$WORK/empty" && $S run pre-no-package --cwd "$WORK/empty" -- --skip-update-check`. Exit code `253`. Output contains `✖ No package.json found`.
- **No token.** Run `$S run pre-no-token --cwd "$FIXTURE" -- --skip-update-check`. Exit code `254`. Output contains `✖ Missing project token` and `CHROMATIC_PROJECT_TOKEN`.
- **Incompatible flags.** Run `$S run pre-incompatible --cwd "$FIXTURE" -- -t x --build-script-name foo --build-command bar --skip-update-check`. Exit code `254`. Output contains `✖ Incompatible options: --build-script-name, --build-command`. Repeat with `-t x --junit-report --exit-once-uploaded` (label `pre-incompatible-junit`) for `✖ Incompatible options: --junit-report, --exit-once-uploaded`.
- **Config loaded.** Write `{"onlyChanged":true,"buildScriptName":"build-storybook"}` to `$FIXTURE/chromatic.config.json`. Run `$S run cfg-loaded --cwd "$FIXTURE" -- -t x --skip-update-check --storybook-build-dir /nonexistent --diagnostics-file "$EVIDENCE/cfg-loaded/d.json"`. `jq -c '.configuration' "$EVIDENCE/cfg-loaded/d.json"` is `{"configFile":"chromatic.config.json","onlyChanged":true,"buildScriptName":"build-storybook"}`. `.options.onlyChanged` is `true`. The run continues into `Authenticating with Chromatic`, so its exit depends on the backend, not on the config. Do not assert on it.
- **Invalid config.** Write `{"projectToken": 1, "nope": true}` to `$FIXTURE/bad.json`. Run `$S run cfg-invalid --cwd "$FIXTURE" -- -c bad.json --skip-update-check`. Exit code `254`. Output contains `✖ Configuration file bad.json was invalid`, `Unrecognized key(s) in object: 'nope'`, and `projectToken: Expected string, received number`.
- **Unparseable config.** Write `{bad` to `$FIXTURE/broken.json`. Run `$S run cfg-unparseable --cwd "$FIXTURE" -- -c broken.json --skip-update-check`. Exit code `254`. Output contains `✖ Configuration file broken.json could not be parsed, is it valid JSON?`.
- **Missing config.** Delete `$FIXTURE/chromatic.config.json` first. Run `$S run cfg-missing --cwd "$FIXTURE" -- -c missing.json --skip-update-check`. Exit code `254`. Output contains `✖ Configuration file missing.json could not be found.`
- **Diagnostics and log.** Run `$S run diag-files --cwd "$FIXTURE" -- -t secret-token-value --skip-update-check --storybook-build-dir /nonexistent --log-file "$EVIDENCE/diag-files/chromatic.log" --diagnostics-file "$EVIDENCE/diag-files/d.json"`. Both files exist. `jq -r '.exitCodeKey' "$EVIDENCE/diag-files/d.json"` is set. `grep -c secret-token-value "$EVIDENCE/diag-files/d.json"` must be `0`. Until the CAP-5317 fix ships it is `1` (see Gotchas). In the log, `grep secret-token-value "$EVIDENCE/diag-files/chromatic.log" | grep -vc "No app with code"` must be `0`. A reachable backend rejects the fake token with `No app with code '<token>' found`, and the CLI logs that error as received. That echo is the backend's, not a CLI leak.
- **TTY rendering.** Run `$S tty pre-tty --cwd "$FIXTURE" -- --skip-update-check`. `pane.txt` shows `✖ Missing project token` and a JSON block with `"interactive": true`. `exit_code` is `254`.
- **Proof.** Each label dir holds the command, both streams and the exit code. The `cfg-loaded` and `diag-files` dirs also hold the diagnostics JSON and log.

## Gotchas

- Known failure, `diag-files`, until the CAP-5317 fix ships. `.options.originalArgv` in the diagnostics JSON keeps `-t <token>` verbatim, while `.options.projectToken` is `null`. Report this journey as failing until the CLI redacts argv. Do not drop the assertion or switch the journey to `CHROMATIC_PROJECT_TOKEN` to make it pass. Users attach this file to CI artifacts and support requests, and `--upload-metadata` uploads it to the published Storybook.
- An explicit `--config-file` that does not exist silently falls back to `chromatic.config.json` when that file exists. Remove the default file before the `cfg-missing` journey, or the journey wrongly proceeds to `Authenticating`. See `resolveConfigFileName` in `node-src/lib/getConfiguration.ts`.
- `--dry-run` does not make a run offline. With a token it goes straight to `Authenticating with Chromatic`. See `publish-build`.
- Any journey that gets past preflight hits the backend. Its exit code then depends on the network and on the backend's answer to the token, not on the preflight behavior under test. With the fake tokens used here, a reachable backend gives `202` (`GRAPHQL_ERROR`), and an unreachable one gives a fetch error.
- In non-TTY runs, preflight errors also dump a large diagnostics JSON to the terminal. Assert on the `✖` line, not on line positions.
- Running in the repo root writes `chromatic.log` and diagnostics into the checkout, or reads the repo's own config. Always use `--cwd "$FIXTURE"`.

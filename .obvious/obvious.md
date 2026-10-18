# chromaui/chromatic-cli — Obvious agent guidance

The `chromatic` npm package: a CLI (+ GitHub Action) that builds a project's
Storybook, uploads it to Chromatic, and runs visual tests. Also packages the
Chromatic Storybook addon (same repo).

## Stack
- Node.js >= 22 (engines; .tool-versions pins 22.22.3). Sandbox provisioned v22.22.3 at `~/node22/bin` — add to PATH; system node is v20 and too old.
- Yarn 4.18.0 via corepack (`packageManager` field). Run `corepack enable` once.
- TypeScript + tsdown bundler, Storybook 10 (own harness), Vitest 4, oxlint + oxfmt.
- No external services: no database, cache, or Compose file. Dev stack is Node + Yarn only.

## Commands (from repo root)
| Purpose | Command |
|---|---|
| Install deps (as CI does) | `yarn install --immutable` |
| Build CLI + addon | `yarn build` (output `dist/bin.cjs`) |
| Watch build | `yarn dev` |
| Lint | `yarn lint` |
| Typecheck | `yarn typescript:check` |
| Unit tests + coverage | `yarn test` |
| Build repo's own Storybook | `yarn build-storybook` (stats at `storybook-static/preview-stats.json`) |
| Storybook dev server | `yarn storybook` → http://localhost:9009 |
| Run the built CLI | `node ./dist/bin.cjs --help` |
| Full Chromatic run | `yarn chromatic -t <token>` (needs a real project token) |
| Offline CLI subcommand | `node ./dist/bin.cjs trim-stats-file storybook-static/preview-stats.json` |

## Env vars
- `CHROMATIC_PROJECT_TOKEN` — required only for full runs against Chromatic; NOT needed for install/build/lint/test. Get one per docs in .env.example.
- `CHROMATIC_INDEX_URL` — override backend (prod default; staging/dev values in docs/DEVELOPMENT.md).
- `SMOKE_TEST=1` — run a small story set only.
- `LOG_LEVEL=verbose` — verbose CLI logging.

## Codebase map
See [codebase-map.md](codebase-map.md).

## Local verification (validated 2026-10-13)
1. `yarn install --immutable` — pass.
2. `yarn build` — pass (benign EMPTY_IMPORT_META warnings from storybook chunks).
3. `yarn lint`, `yarn typescript:check` — pass.
4. `yarn test` — 122 files / 1534 tests passed (2 skipped), ~87% statement coverage.
5. `node ./dist/bin.cjs --help` — exit 0, usage printed.
6. `node ./dist/bin.cjs trim-stats-file storybook-static/preview-stats.json` — exit 0, wrote trimmed stats.
7. `yarn storybook` — "Storybook ready!", HTTP 200 on port 9009.

## Snapshot
- snapshotId: `f4ap0cico4ivz9h6uzhr:default`
- captured: `2026-10-13T22:40:30.983Z`
- Contains: Node 22 at ~/node22, Yarn 4 via corepack, installed node_modules, working build, Storybook dev server recipe.

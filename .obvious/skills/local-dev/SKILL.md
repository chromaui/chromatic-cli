---
name: local-dev
description: How to bring chromaui/chromatic-cli to a working local dev environment (validated onboarding recipe)
---

# Local dev — chromaui/chromatic-cli

Recorded by the autobuild onboarding run on 2026-10-13. Everything below was
executed successfully in the sandbox; it is the validated path, not a guess.

## Runtime provisioning
- Repo requires Node >= 22 (`engines`), pinned 22.22.3 in `.tool-versions`.
  Sandboxes ship node v20 — too old. Fix:
  ```bash
  curl -fsSL -o /tmp/node22.tar.xz https://nodejs.org/dist/v22.22.3/node-v22.22.3-linux-x64.tar.xz
  mkdir -p ~/node22 && tar -xJf /tmp/node22.tar.xz -C ~/node22 --strip-components=1
  export PATH=~/node22/bin:$PATH
  ```
- Yarn is not preinstalled; `corepack enable` (corepack ships with node 22)
  provides Yarn 4.18.0 per the `packageManager` field. First `yarn` call
  downloads the Yarn CLI from repo.yarnpkg.com (needs network).

## Gotchas (hit during onboarding — do not skip)
1. **Root-owned build leftovers**: `node_modules/`, `dist/`, `action/` arrive
   root-owned from the image build. `yarn install` then fails in the link step
   (`EACCES: unlink node_modules/.bin/...`) or `prepare` (`EPERM: chmod
   dist/bin.cjs`). Fix once, before first install:
   `sudo rm -rf node_modules dist action bin coverage .cache`
2. **Stray `bun.lock`**: an untracked bun.lock may appear (someone ran bun);
   the repo uses Yarn 4. Safe to delete; do not commit.
3. `yarn install --immutable` runs a few seconds warm; `prepare` triggers the
   tsdown build automatically.

## Validated verification sequence
| Step | Command | Result on 2026-10-13 |
|---|---|---|
| Install | `yarn install --immutable` | exit 0 |
| Build | `yarn build` | exit 0 (~6s; EMPTY_IMPORT_META warnings are benign) |
| CLI smoke | `node dist/bin.cjs --help` | exit 0, usage output |
| Lint | `yarn lint` | exit 0 |
| Typecheck | `yarn typescript:check` | exit 0 |
| Tests | `yarn test` | 1534 passed / 2 skipped, 122 files |
| Storybook build | `yarn build-storybook` | exit 0; stats at `storybook-static/preview-stats.json` |
| CLI subcommand | `node dist/bin.cjs trim-stats-file storybook-static/preview-stats.json` | exit 0 |
| Storybook dev | `yarn storybook` | ready ~30s; HTTP 200 on :9009 |

## Notes
- No Postgres/Redis/Compose exists in this repo; nothing to bring up besides
  the Node toolchain. `service_unreachable` never applies.
- A full `yarn chromatic -t <token>` run needs a real Chromatic project token
  and the production (or staging/dev) backend — out of scope for local
  onboarding; do not request a token to complete onboarding.
- `trim-stats-file` writes its output next to the input (`.trimmed.json`),
  not to a second positional arg target as older help text suggests.

# Smoke Tests — Notes & Open Decision (yarn → pnpm migration)

> Working notes to pick up later. Captures the discussion around what to do with the
> package-manager smoke tests after migrating the repo from yarn to pnpm.
> **No smoke-test workflow has been changed yet** — this is a parked decision.

## Background

The repo was migrated from yarn 4 to pnpm. During the mechanical migration we deliberately
**left all `smoke-test-*.yml` workflows untouched** and flagged them as a separate decision,
because they're entangled with the CLI's package-manager support (a product feature), not just
with how this repo builds itself.

## Current state of the smoke-test workflows

All remaining `yarn` references in CI live in these files. They split into two groups:

### Group A — deliberately test yarn as a package manager (yarn is the point)

| Workflow | What it exercises |
|---|---|
| `.github/workflows/smoke-test-yarn.yml` | default yarn (`yarn` + `yarn build` + `yarn chromatic`) |
| `.github/workflows/smoke-test-yarn-classic.yml` | `yarn set version 1.22.22` → **Yarn v1 (Classic)**, then `npx -p . chromatic` |
| `.github/workflows/smoke-test-yarn-berry.yml` | Yarn v2+ (**Berry**), immutable installs off, then `npx -p . chromatic` |
| `.github/workflows/smoke-test-yarn-canary.yml` | `yarn set version canary` → **unreleased/nightly yarn** |
| `.github/workflows/smoke-test-windows.yml` | named "Smoke test via yarn on Windows" — reads as a deliberate yarn-on-Windows scenario |

### Group B — use yarn only to build the repo, then test something else (yarn is incidental)

| Workflow | Actually testing |
|---|---|
| `.github/workflows/smoke-test-node-api.yml` | invoking the CLI via its Node API (`./scripts/run-via-node.mjs`) |
| `.github/workflows/smoke-test-node22.yml` | running under Node 22 |
| `.github/workflows/smoke-test-node24.yml` | running under Node 24 |
| `.github/workflows/smoke-test-npx.yml` | invoking via `npx -p . chromatic` |
| `.github/workflows/smoke-test-action.yml` | the GitHub Action wrapper (`uses: ./`) |
| `.github/workflows/smoke-test-action-next.yml` | the `action-next` path (`yarn run release-next`, `chromaui/action-next@latest`) |

`.github/workflows/pull-request-workflow.yml` orchestrates all of these.

## What the yarn smoke tests actually verify

The CLI runs *inside* users' projects, so it has real yarn-specific logic that must keep working:

- **Package-manager detection & install:** `node-src/lib/getPackageManager.ts`, `node-src/lib/installDependencies.ts`
- **Lockfile parsing for TurboSnap:** `node-src/lib/turbosnap/findChangedDependencies.ts`, `node-src/lib/turbosnap/getDependencies.ts` — the CLI reads the lockfile to decide which dependencies changed and therefore which stories to re-snapshot. **Yarn Classic's `yarn.lock` format differs completely from Berry's**, so classic vs berry are genuinely different code paths; canary is early-warning against yarn releases that aren't out yet.

## Key finding: the format-parsing value is already unit-tested

The thing that differs between yarn versions — **lockfile format parsing** — is already covered by
deterministic, offline unit tests with committed fixtures:

- `node-src/lib/turbosnap/getDependencies.test.ts` → *"should find top-level dependencies for each lock file type"* loops over `SUPPORTED_LOCK_FILES` against `node-src/__mocks__/dependencyParsing/`, which holds `yarn.lock`, `pnpm-lock.yaml`, and `package-lock.json`.
- `node-src/lib/turbosnap/findChangedDependencies.test.ts` → uses `node-src/__mocks__/dependencyChanges/` fixtures split by format: `plain/yarn.lock` (Classic v1), `berry/yarn.lock` + `berry-chalk/yarn.lock` (Berry v2+), `react-async-9/10` (real-world diffs).

So the smoke tests' unique remaining value is **only end-to-end integration** (build the CLI, invoke
the real binary, upload to a real Chromatic backend) — not lockfile correctness, which is better
covered above.

## Fragility concerns

1. **Live + networked:** every yarn smoke test needs a real Chromatic project token and network.
2. **`yarn set version canary` is non-deterministic by design** — it pulls nightly yarn, so it can break for reasons entirely outside this repo. If kept at all, it belongs on a schedule (cron), not per-PR.
3. **Post-migration weirdness:** the repo now has no `yarn.lock` and `packageManager` is `pnpm@11.9.0`. A `yarn install` here fabricates a throwaway lockfile from `package.json`.
4. **⚠️ Overrides gotcha (can actually break the build):** the former yarn `resolutions` were moved to `overrides:` in `pnpm-workspace.yaml`. **Yarn cannot read `pnpm-workspace.yaml`**, and `resolutions` was removed from `package.json`. So any `yarn install` smoke test now applies **no** version pins (`any-observable ^0.5.1`, `es-toolkit 1.46.0`, `lodash 4.17.21`, `@types/minimatch 5.1.2`) and may resolve different/broken transitive versions. This affects **only the yarn-install smoke tests** — pnpm reads the overrides correctly.

## Is a package-manager smoke-test matrix "normal"?

- **Some** PM-awareness in tests is normal for a CLI that runs inside arbitrary projects — the invocation surface (`npx` / `yarn` / `pnpm dlx` / the Action / the Node API) and lockfile formats genuinely differ.
- A full matrix of **live** smoke tests, including a **canary/nightly** package manager, is on the heavier/more-fragile end and unusual. The mainstream pattern is: unit-test the format-specific logic with fixtures (we do), and keep integration tests thin.

## Proposed better direction: a dedicated sample project

Today the smoke tests dogfood on the CLI's **own repo**, which conflates two unrelated axes:
"build the CLI" and "what package manager is the *user's* project on."

A **dedicated minimal Storybook sample project** (with its own `package.json` and committed
per-PM lockfiles) would fix the root cause:

- **Decouples the axes** — CLI repo stays pnpm-canonical; the sample project is installed under whatever PM is being exercised.
- **Kills the overrides footgun** — the sample project has its own `package.json`, so there's no `resolutions` pin to lose.
- **Deterministic** — commit `yarn.lock` / `pnpm-lock.yaml` / `package-lock.json` *for the sample project*; those are the actual test input and don't churn with the CLI's own dependencies.
- **More representative** — a real (tiny) app installed with yarn is exactly what a real yarn user has.
- It's the **integration-level twin** of the existing `node-src/__mocks__` lockfile fixtures.

Open questions / costs:
- **Where it lives:** in-repo subdir (e.g. `test-projects/`, kept out of the pnpm workspace) vs a separate repo. Lean in-repo for simplicity + version-locking.
- **Still needs a token + network** for the real upload (or point at a dev/mock backend — bigger question).
- **Matrix breadth** is still a choice, but now it's cheap and deterministic.
- **Canary** can't be stabilized by a committed lockfile (it sets its own yarn version) — cron it or drop it.
- Keep the sample app tiny (a couple of stories) so builds stay fast.

## Options on the table

- **A. Keep the yarn matrix as-is** → must **re-add `resolutions` to `package.json`** (alongside the pnpm `overrides`) so `yarn install` stays pinned. Cost: duplicated 4-line pin list in two places.
- **B. Trim** → keep one yarn integration check (`smoke-test-yarn.yml`), drop `berry` / `canary` / `classic` (format parsing is unit-tested), and migrate the Group B build steps to pnpm. Simplest short-term.
- **C. Sample-project rework** → the direction above. Bigger, net-new; best long-term. Would want a proper brainstorm/design pass before building.

## Recommendation & immediate action item

- Lean toward **B now, C later**.
- **Whatever is chosen: if any `yarn install` smoke test stays, re-add `resolutions` to `package.json` first** — otherwise those yarn builds silently lose the version pins (see fragility #4).

## Related note

`.gitignore` keeps the `**/.yarn/*` (and `**/.pnp.*`) ignore entries — the comment there notes they
filter yarn subdirectories used for testing, so they were intentionally retained during the migration.

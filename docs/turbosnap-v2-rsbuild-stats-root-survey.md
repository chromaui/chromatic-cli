# Which stats root do real rsbuild layouts emit?

Survey for the *TurboSnap 2.0 — Rsbuild* wayfinder map. Measured 2026-08-04 against
`~/Projects/turbosnap-monorepo`, CLI at `6ad8d9d6` (`Support repository-root rsbuild stats`).

## Answer

**The stats root is `process.cwd()` of the `storybook build` process, and nothing else.** The package
manager is not an axis: npm, pnpm and Yarn all run workspace scripts from the package directory, so
all three emit *project-root*-relative names. Only a runner that builds from the repository root emits
repository-root-relative names.

**And v2 does not yet handle that case.** A repository-root build resolves its stats root correctly but
then bails `unrecognizedStoryEntry`, uploading nothing. The fallback added in `6ad8d9d6` is incomplete.

## Why cwd is the only variable

Two mechanisms name modules, and both anchor at cwd:

- **rspack's relative `module.name`** is relative to the compiler `context`, which rspack defaults to
  `process.cwd()` (`@rspack/core/dist/index.js:5715`). rsbuild's `rootPath` is
  `userConfig.root ? … : cwd` (`@rsbuild/core/dist/131.js:3567`) and `storybook-builder-rsbuild` never
  sets `root` — it only sets `output.distPath.root`. So context stays cwd.
- **the shim's relativization.** `toNormalizedModulePath` in `storybook-builder-rsbuild` 3.3.0+ maps an
  absolute path through `relative(process.cwd(), modulePath)` (`dist/index.js:106`) and leaves an
  already-relative name untouched.

Because both anchor at cwd, a stats file is uniformly rooted — there is no mixed-root shape to handle.

## Measured: package-manager runners all use the package directory

| Runner | cwd |
| --- | --- |
| `yarn workspace <pkg> …` (Yarn 4.2.2) | package dir |
| `npm run -w <pkg> …` | package dir |
| `pnpm --filter <pkg> run …` | package dir |
| `nx:run-script` (inferred from package scripts) | package dir — `context.root + project.root` |
| `nx:run-commands` **without an explicit `cwd`** | **workspace root** |

`nx:run-commands` is the documented exception: *"If it's not specified the commands will run in the
workspace root"* (`nx/dist/src/executors/run-commands/schema.json`). That, plus any CI step that runs
`storybook build -c packages/x/.storybook` from the checkout root, is how a repository-root layout
arises in the wild.

## Measured: the four builds

`getStatsRoot` classified every case correctly. Story keys are what `traceChangedFiles` uploaded.

| Fixture | Builder | Build cwd | Stats root | Result |
| --- | --- | --- | --- | --- |
| `ui-sb8-rsbuild` | 1.0.3 | package dir | project root | 2 project-relative story keys |
| `ui-sb9-rsbuild` | 2.1.6 | package dir | project root | 2 project-relative story keys |
| `ui-rsbuild` | 3.4.0 | package dir | project root | 3 project-relative story keys |
| `ui-rsbuild` | 3.4.0 | **repository root** | **repository root** | **bailed `unrecognizedStoryEntry`** |

A single-package repository cannot distinguish the two roots — `projectRoot === repositoryRoot`, and
`getStatsRoot` dedupes them through `new Set([projectRoot, repositoryRoot])`. It is the degenerate case,
not a fourth layout.

## The hole: `canonicalEntry` is anchored at the wrong root

`collectStoryImporters` canonicalises the two sides of the entry comparison against different roots:

```ts
const canonical      = (name: string) => normalizeStatsPath(name, projectRoot, statsRoot);
const canonicalEntry = (name: string) => normalizeStatsPath(name, projectRoot);
```

On a repository-root build the generated entry is spelled `./storybook-stories.js` — it physically sits
at the *repository root*, because the builder writes its virtual entry at cwd. So:

- the real module canonicalises through `canonical` to `../../storybook-stories.js`
- the catalogue entry canonicalises through `canonicalEntry` to `./storybook-stories.js`

The two can never meet. No importer is recognised as an entry file, the lazy context's parent entry is
unrecognised, and the build bails `unrecognizedStoryEntry`.

Anchoring `canonicalEntry` at `statsRoot` too makes the repository-root build upload the **identical
three project-relative story keys** as the package-directory build, and leaves all three
package-directory cases byte-identical. That is the whole fix, and it is a one-token change — but it is
a decision, not a mechanical correction, because of the next section.

## `6ad8d9d6`'s own test encodes a layout the builder never produces

`index.statsRoot.test.ts` spells the repository-root importer `packages/ui/storybook-stories.js` — the
generated entry at the *project* root, named from the repository root. The real builder emits
`./storybook-stories.js`, the entry at the *repository* root. The synthetic fixture is the opposite of
the measured layout, which is why that test fails under the fix above and why the map's
"entry relocation" term needs refining: the entry follows **cwd**, not the project root. Builder 2.1.0
moved it from the package cache directory to cwd, which merely *looks like* the project root whenever
you build from the package directory.

## Corrections to the map

- **Trap 4 is wrong.** The map states "the fixture cannot reproduce a repo-root build without a
  synthetic transform." It can. `storybook build -c packages/ui-rsbuild/.storybook` from the repository
  root succeeds and emits a genuine, uniformly repository-root-relative stats file — no transform. It
  needs one prerequisite: a root `tsconfig.json` extending `tsconfig.base.json`, because `@myorg/shared`
  resolves only through tsconfig `paths` (its `package.json` `main` points at an unbuilt
  `./src/index.js`) and rsbuild loads tsconfig from cwd. That file is now present, untracked, in the
  fixture repo.
- **`ui-rsbuild` is on builder 3.4.0, not the 3.3.4 the map's fixture list still names.** The hoisted
  `storybook-builder-rsbuild` resolves to 3.4.0. This does not invalidate anything: the 3.4.0 ticket
  measured 3.3.4 and 3.4.0 as byte-identical on this fixture. It only means the fixture list is stale.
- **`turbosnap-manifest` cannot exercise this at all.** It calls `buildManifest(stats, projectRoot, …)`
  with no `statsRoot`, unlike production which passes `getStatsRoot(stats, input)`. Stats-root claims
  must not be sourced from that command.

## Reproducing

```sh
cd ~/Projects/turbosnap-monorepo
# root tsconfig.json extending tsconfig.base.json must exist
./node_modules/.bin/storybook build -c packages/ui-rsbuild/.storybook -o /tmp/reporoot-out --stats-json
```

Then run `traceChangedFiles` with `projectRoot=packages/ui-rsbuild`,
`repositoryRoot=~/Projects/turbosnap-monorepo` and that stats file.

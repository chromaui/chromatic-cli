# Re-measuring the rsbuild bail matrix after the F1–F3 fixes

Wayfinder ticket: *Re-measure the rsbuild bail matrix after the F1–F3 fixes* on
[TurboSnap 2.0 — Rsbuild](https://app.notion.com/p/3b26e816203480b586a7d1e09086fa6a).

CLI at `857ee341` (`Refuse story keys a require-context swept out of node_modules`), fixtures at
`~/Projects/turbosnap-monorepo`. Every row below is the production `traceChangedFiles`, run through
`chromatic turbosnap-bail`, not `buildManifest`.

## Result

**Six of the seven audited rows now reach the hash upload or bail for the reason they actually
failed. One still bails, and its reason misnames the cause.**

| # | Stats input | Generation | Source | Audit result | Result now |
| - | ----------- | ---------- | ------ | ------------ | ---------- |
| 1 | `ui-sb8-rsbuild`, as built | framework `1.0.3` | real | no bail | `fallback`, upload reached — 2 story files, 25 files, `a747b31d3cdd227a` |
| 2 | `ui-sb9-rsbuild`, as built | framework `2.1.6` | real | no bail | `fallback`, upload reached — 2 story files, 32 files, `16689e55422e6b05` |
| 3 | `ui-rsbuild`, as built | builder `3.4.0` | real | `noStoryFiles` | `fallback`, upload reached — 3 story files, 203 files, `ce4b5cbeecf3013e` |
| 4 | same, `./` restored on every raw name | builder `3.4.0` | synthetic | no bail | `fallback` — manifest identical to row 3 |
| 5 | hoisted builder cache, entry files present on disk | framework `1.0.3` | synthetic | `anchorMismatch` / `statsEntryOutsideProject` | `unrecognizedStoryEntry` + Sentry |
| 6 | same, entry files absent | framework `1.0.3` | synthetic | `noStoryFiles` | `unrecognizedStoryEntry` + Sentry |
| 7 | Storybook built from the repository root | builder `3.4.0` | **real** (was synthetic) | `anchorMismatch` / `unresolvedSourceModules` | `unrecognizedStoryEntry` + Sentry |

> **2026-08-05.** Rows 5 and 6 assert a layout the builder cannot emit, and rows 3, 4 and 7 all reach
> the upload now. See [Resolution](#resolution-2026-08-05) at the end of this document; the body above
> is the 2026-08-04 measurement, left as recorded.

Rows 1 and 2 report the *framework* version because their `project.json` records no builder
(`builderSource: "unrecorded"`) — the same gap the builder-name research ticket measured. Rows 3, 4
and 7 resolve the builder itself, `3.4.0`, and rows 3/4 hash to the manifest the 3.4.0 ticket
recorded, so this is the same build that ticket measured.

## What each change did

**F1 (canonical keys) closes row 3 outright.** The real 3.4.0 build reaches the upload with three
story files, no transform. Row 4 — the audit's proof that one missing `./` was the whole difference —
is now redundant: it produces a *byte-identical* manifest (`ce4b5cbeecf3013e`, 3 story files, 203
files) to the untransformed build, so the matcher is spelling-insensitive rather than merely fixed for
one spelling.

**F2 (dropping `statsEntryOutsideProject`, adding `unrecognizedStoryEntry`) fixes the diagnosis on
rows 5 and 6, and collapses them into one row.** The hoisted-cache layout no longer claims the stats
describe another project. Both now bail `unrecognizedStoryEntry` with a Sentry event, and the two
results are identical — whether the generated entry exists on disk is no longer an input to any
verdict, which is exactly what F2 decided.

That bail is correct and well named. `STORIES_ENTRY_FILES` catalogues
`./node_modules/.cache/storybook-rsbuild-builder/storybook-stories.js`, and the hoisted spelling
`../../node_modules/.cache/storybook-rsbuild-builder/storybook-stories.js` is genuinely absent from
it. v2 says it does not recognize the entry because it does not.

**F3 (repository-root stats support) does not close row 7, and the new reason is worse-named than the
old one.** This row is now a *real* measurement rather than a synthetic transform — a genuine
repository-root build reproduces it:

```sh
cd ~/Projects/turbosnap-monorepo   # a root tsconfig.json extending tsconfig.base.json must exist
./node_modules/.bin/storybook build -c packages/ui-rsbuild/.storybook -o /tmp/reporoot-out --stats-json
cd packages/ui-rsbuild
node ~/Projects/chromatic-cli/dist/bin.cjs turbosnap-bail \
  -s /tmp/reporoot-out/preview-stats.json --project-json /tmp/reporoot-out/project.json
```

`./storybook-stories.js` **is** in `STORIES_ENTRY_FILES`, so nothing about this entry is
unrecognized. It fails because `canonicalEntry` anchors the catalogue at `projectRoot` while the
name is stats-root-relative, and on a root build the entry sits at the repository root. The reason
points at the catalogue when the fault is the anchor — the same mechanism the stats-root survey
found, and the decision the *builder-entry catalogue should anchor at the stats root* ticket carries.

## Bounds

- Only the seven audited rows. The additive shim's `internalError` on builder 3.3.0/3.3.1 is an
  eighth failure found after the audit; it is carried by its own ticket and is not re-measured here.
- The stub Index client always answers success, so `indexUnavailable` and `indexContractViolation`
  stay unreachable, as designed.
- Rows 4–6 are name-only transforms of a real stats file (`identifier` and `nameForCondition` left
  intact), so they change the spelling v2 compares and not the graph. Whether a real project ever
  hoists the builder cache out of the package is unverified — the bail is honest either way.

## Reproducing rows 1–3

```sh
cd ~/Projects/chromatic-cli && yarn build
cd ~/Projects/turbosnap-monorepo/packages/<ui-sb8-rsbuild|ui-sb9-rsbuild|ui-rsbuild>
node ~/Projects/chromatic-cli/dist/bin.cjs turbosnap-bail
```

Rows 4–6 rewrite every `name` / `issuerName` / `moduleName` / `resolvedModule` field of a real stats
file: row 4 prefixes `./` onto each raw name of `ui-rsbuild`'s stats; rows 5 and 6 rewrite
`./node_modules/.cache/` to `../../node_modules/.cache/` in `ui-sb8-rsbuild`'s. Row 5 additionally
needs the two generated entry files copied to
`turbosnap-monorepo/node_modules/.cache/storybook-rsbuild-builder/`.

## Resolution (2026-08-05)

Wayfinder ticket: *Decide whether the remaining rsbuild failures need a new bail reason*. CLI at
`3499ff42`, one commit after the stats-root anchoring fix (`e4c0ba91`) that the body above predates.

**No reachable rsbuild layout reports a reason that points away from its cause. The vocabulary is
unchanged.**

| Layout | Verdict at `3499ff42` | Reason names the cause? |
| ------ | --------------------- | ----------------------- |
| Rows 1-4 and 7 | `fallback`, upload reached | — |
| Hoisted builder cache, repository-root build | `fallback`, upload reached | — |
| Hoisted builder cache, package-directory build (rows 5+6) | `unrecognizedStoryEntry` + Sentry | yes, but the layout is not producible |
| Builder `3.3.0`/`3.3.1` (shape C) | `internalError` / `manifestBuildFailed` + Sentry | no — carried by its own ticket |

### Row 7 is closed on a genuine repository-root build

The `e4c0ba91` anchoring fix closes it: the same rebuild the body above describes now reaches the
upload, builder `3.4.0` resolved. Rows 1-3 also re-measured `fallback`, unchanged hashes.

### The hoisted cache splits into two cells, and only one was ever reachable

`e4c0ba91` accepts a hoisted cache built from the repository root — at that root the entry is spelled
`./node_modules/.cache/storybook-rsbuild-builder/storybook-stories.js`, which is catalogued.
Confirmed by re-rooting `ui-sb8-rsbuild`'s real stats at the repository root with the cache left at
`./node_modules/`: `fallback`, upload reached.

The package-directory cell still bails `unrecognizedStoryEntry`, and **the builder cannot produce it.**
The cache directory comes from `find-cache-dir` via `pkg-dir`:

```js
directory = packageDirectorySync({ cwd: process.cwd() })   // nearest package.json ABOVE cwd
const nodeModules = getNodeModuleDirectory(directory)      // <that package>/node_modules
return useDirectory(path.join(directory, 'node_modules', '.cache', options.name), options)
```

The cache anchors to the nearest `package.json` above cwd, never above it, and `useDirectory` mkdirs
it when absent. So hoisting the builder *package* does not hoist its *cache*. Two measurements:

- **Real build, cache deleted first.** `ui-sb8-rsbuild` with its own Storybook `8.6.18` and builder
  `1.0.3` (`node_modules/.bin/storybook build`, *not* the workspace-root binary — that resolves
  `10.6.0-alpha.3` and silently measures a different Storybook) recreated the cache at
  `packages/ui-sb8-rsbuild/node_modules/.cache/`, not at the repository root, and spelled the entry
  `./node_modules/.cache/…`.
- **Isolated helper, package with no `node_modules` at all** — the actual hoisted layout, which the nx
  fixture cannot show because it installs per package. `getNodeModuleDirectory` returns the
  non-existent path rather than bailing (the guard only trips when `node_modules` exists and is
  unwritable, or the package directory itself is unwritable), so the cache lands at
  `<package>/node_modules/.cache/` and the entry is `./node_modules/.cache/…` — catalogued.

Rows 5 and 6 are kept as the record of what `unrecognizedStoryEntry` guards, marked unreachable.
The bail is not dead code: `find-cache-dir` honours a `CACHE_DIR` environment variable, so a CI system
pointing it outside the project would produce an uncatalogued spelling, and the bail is the loud
failure the entry-contract ticket wanted if upstream moves the entry again.

### A third stats root exists, was measured, and is declined

A build whose cwd is neither the package nor the repository root — `cd packages && storybook build -c
ui-sb8-rsbuild/.storybook`, real, not a transform — names its sources `./ui-sb8-rsbuild/src/…`. They
resolve under neither candidate root, so `getStatsRoot` falls back to `projectRoot` and the build bails
`anchorMismatch` / `unresolvedSourceModules`. That reason is literally true and is v1's own predicate,
but it points at "the stats describe another project" when the cause is that cwd was never tried.

Declined rather than named. The stats-root survey established that npm, pnpm, Yarn and `nx:run-script`
all build from the package directory, and `nx:run-commands` without an explicit `cwd` builds from the
repository root — both supported. No tooling default produces an intermediate cwd, and the cell fails
safe to v1. If one is ever observed, the fix is a subreason separating an untried stats root from a
genuine wrong-project anchor, not a new top-level reason.

### What the audience for a new reason would have been

Flag-only bail reasons print nothing to the customer: `formatBailReason`
(`node-src/ui/messages/info/tracedAffectedFiles.ts`) renders only the four file-carrying reasons, so
`unrecognizedStoryEntry` reaches a human through Sentry and the analytics payload alone. The evidence
is already attached there — `v2/index.ts` sets a `turboSnapUnrecognizedStoryEntry` context with the
exact entry spellings and repeats them in the error message. There was no missing evidence to enrich.

The `storyFileHashes.size === 0` guard on that bail cannot silently hide partial coverage on rsbuild: a
mixed build needs one generated entry hoisted and the other not, and both live in the same cache
directory.

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

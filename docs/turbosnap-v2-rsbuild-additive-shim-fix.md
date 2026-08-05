# Fixing TurboSnap v2 on the additive Chromatic shim (`storybook-builder-rsbuild` 3.3.0/3.3.1)

Measured 2026-08-05. Resolves the wayfinder ticket "Decide what v2 should do with entry-imported
`node_modules` context modules" on the
[TurboSnap 2.0 — Rsbuild](https://app.notion.com/p/3b26e816203480b586a7d1e09086fa6a) map.

Supersedes the mechanism recorded in `turbosnap-v2-rsbuild-additive-shim.md`, whose *outcomes* (the
`EISDIR` bail, the 43 story files, the identical real hashes) all reproduce exactly, but whose
*cause* was mis-attributed. That document's 2026-08-04 body is left unedited.

## Verdict

Both of shape C's failures come from one cause, and it is not the entry-imported `node_modules`
context modules. Two small, generation-blind fixes close them, after which **3.3.0, 3.3.1 and 3.3.4
produce a byte-identical manifest**. No new bail reason, no version floor, and no `node_modules`
story-importer rule.

## The cause: `modules` is not a concatenation list on shape C

v2 reads a stats module's own root file from `moduleFileNames`, which preferred the *first entry of*
`module.modules`. That holds on 3.3.4, where a concatenated record nests its own root file first. On
3.3.0/3.3.1 the same record nests its require-contexts instead, and omits the root:

```
3.3.4  "./node_modules/storybook/dist/csf/index.js + 11 modules"
         modules: ["./node_modules/storybook/dist/csf/index.js + 11 modules",
                   "./node_modules/storybook/dist/_browser-chunks/chunk-5FAQJLSD.js", …]

3.3.0  "./node_modules/storybook/dist/csf/index.js + 11 modules"
         modules: ["./node_modules/storybook/dist/_browser-chunks/*.js",   <- a glob, not a file
                   "./node_modules/storybook/dist/csf/*.js",
                   "./node_modules/storybook/dist/shared/open-service/index.js"]
```

So the record's root resolves to a glob, which has no file on disk, and `collectStoryImporters`
promotes any entry-imported module with no file to a story importer — that is how the lazy
require-context is recognised. The 35 modules naming `csf/index.js + 11 modules` as a reason then
become story files. `entry-preview-argtypes.js + 6 modules` adds 8 more the same way. That is the 40.

One nested name is the directory `./node_modules/@storybook/react/dist/`, which `existsSync` accepts
and the hasher then reads, throwing `EISDIR`. It is a **nested member of a concatenated record**, not
a top-level context module.

### What the ticket's premise got wrong

The three entry-imported `node_modules` `ContextModule` records —
`storybook/dist/_browser-chunks/*.js`, `storybook/dist/csf/*.js` and `@storybook/react/dist/` — *are*
promoted to story importers, and they are **inert**: no module in the stats names any of them as a
reason, so they claim zero files. Excluding them would have changed nothing.

## The fixes

1. **Root a module at its own name** (`moduleFileNames`). Only `module.name` is guaranteed to spell
   the file the record stands for; `modules` is the builder's, and shape C fills it with contexts.
   The concatenation suffix is stripped from every name so the root cannot duplicate a member that
   spells the same file without it.
2. **Hash only regular files** (`hashFiles`). `statSync(...).isFile()` replaces `existsSync`, so a
   module named after a directory is skipped rather than crashing the build. Skipping loses no
   evidence — a directory is never a source file, so it can never be edited as one. A file that
   exists but cannot be read still throws, and that bail is the right outcome: v1 traces it instead.
   Silently dropping such a file would remove it from the manifest, and an edit to it would then
   recapture nothing — the unsafe direction.

Both are needed and neither substitutes for the other: fix 2 alone leaves 43 story files and drains
`<storybookGlobals>` from 51 to 13; fix 1 alone still throws `EISDIR`.

## Measured

Real 3.3.0/3.3.1/3.3.4 stats from `~/Projects/turbosnap-v2-artifacts/rsbuild-additive-shim/`, replayed
against a tree rebuilt from the recorded manifests' own file keys, so every path's presence and kind
on disk is faithful. The instrument is validated by 3.3.4 reproducing its recorded structure exactly
(3 stories, 203 files, 151/2/51).

| | before | after |
| --- | --- | --- |
| 3.3.0 | `EISDIR` → `internalError` / `manifestBuildFailed` + Sentry | 3 / 203, `fc5520a63a08b89e` |
| 3.3.1 | same | 3 / 203, **same hash** |
| 3.3.4 | 3 / 203, `fc5520a63a08b89e` | unchanged, **same hash** |

Attribution converges too: 151 `storyReachable` / 2 `previewSubtree` / 51 `storybookGlobals` on all
three. The builder generation has stopped being an input to the manifest.

### Regression gate

All ten fixtures in `turbosnap-monorepo` — Vite, webpack and rsbuild, SB 8/9/10 — were replayed from
their real `preview-stats.json` before and after. Every `storybookHash`, story count, file count and
attribution triple is **identical**, including `ui-rsbuild` at `a72d0a20837766e8`, which matches the
package-directory baseline recorded on the stats-root ticket. The change is inert everywhere except
shape C.

`yarn typescript:check` and `yarn lint --quiet` are silent; 1190 tests pass. Two tests pin the fixes,
each verified to fail without its own fix. The shared `fs` mock across the manifest suites now models
a trailing-slash path as a present-but-not-a-file directory, and `getFileHashes` rejects one with
`EISDIR`, so the guard's test cannot pass vacuously.

## Bearing on decisions already recorded

- **The version floor.** Not needed. The defect is real but fixable, and the fix is generation-blind,
  so a floor keyed on the builder version would strand working projects for nothing. This does not
  reopen [Decide whether rspackVersion should anchor and gate rsbuild
  stats](https://app.notion.com/p/3b26e816203481148917d0b9400a752a).
- **The unmatchable-story-key question.** Shape C's 40 unmatchable keys are gone at the source: they
  were never story files, so no rule about what the Index can match is required to remove them. The
  ruling on [Decide whether a story key the Index can never match should count as a story
  file](https://app.notion.com/p/3b26e816203481428530d347cb62d6a9) is untouched, and the deliberate
  `node_modules`-sweep refusal shipped in `857ee341` still stands on its own evidence.
- **Cost.** Unchanged. `statSync` replaces `existsSync`, which is the same syscall. Shape C's stats
  are still 49× larger than 3.3.4's, which is upload and parse weight upstream owns.

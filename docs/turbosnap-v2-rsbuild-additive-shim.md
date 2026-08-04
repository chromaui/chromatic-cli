# TurboSnap v2 on the additive Chromatic shim (`storybook-builder-rsbuild` 3.3.0/3.3.1)

Measured 2026-08-04. Answers the wayfinder ticket "Does the additive shim in builder 3.3.0/3.3.1
duplicate manifest nodes?" on the [TurboSnap 2.0 — Rsbuild](https://app.notion.com/p/3b26e816203480b586a7d1e09086fa6a)
map.

## Verdict

Shape C does **not** duplicate manifest nodes, and it does **not** bail `noStoryFiles`. It fails two
other ways, both new:

1. **It bails with an internal error.** Real 3.3.0/3.3.1 stats produce
   `internalError: true` / `bailSubreason: manifestBuildFailed`, with a Sentry report, and never
   reach the Index upload. `buildManifest` throws `EISDIR: illegal operation on a directory, read`.
2. **Underneath that crash it over-captures story files by 14×** — 43 story files where 3.3.4
   reports 3. The 40 extra keys are all `node_modules` chunks, and the Index can never match any of
   them.

Both come from the same cause: 3.3.0's shim calls `stats.toJson({ all: true, … })`, and `all: true`
emits `ContextModule` records that 3.3.2+'s narrower `{ modules, reasons, nestedModules }` omits.

## Why the prediction was half right

The ticket reasoned that because the additive form retains the original records, their `./`-prefixed
names survive and entry matching still finds `./storybook-stories.js`. That is confirmed: with the
crashing record neutralised, all three real stories are detected and their hashes are **byte-identical
to 3.3.4's**:

| | 3.3.0 (crash neutralised) | 3.3.4 |
| --- | --- | --- |
| `storyFiles` | 43 | 3 |
| `storyFiles` under `node_modules` | 40 | 0 |
| `files` | 203 | 203 |
| `storybookFiles` | 5 (identical members) | 5 |
| `Badge`/`Button`/`UserCard` story hashes | identical | identical |
| duplicated attribution members | 0 | 0 |
| stats size on disk | 6.18 MB | 127 KB |

So the appended reduced records are inert for the manifest — the predicted double-count does not
happen. The pre-seeded `visited` set is why: it is keyed on the **raw** top-level `id::name`, and
`toChromaticModule` reproduces exactly that key for any top-level record with a string `id`, so every
original is skipped rather than re-appended.

## Mechanism 1 — the `EISDIR` crash

`all: true` emits a record whose `name` is a **directory**:

```
name: "./node_modules/@storybook/react/dist/"   id: same   reasons: ["storybook-config-entry.js"]
```

It is a graph module, so `getFileHashes` hashes it, and hashing a directory throws. The throw is
caught and classified, which is why the outcome is a bail rather than a crashed build — but it is an
`internalError` bail that reports to Sentry on **every** build of an affected project.

3.3.4 stats contain no such record.

## Mechanism 2 — the 40 spurious story files

`collectStoryImporters` promotes any module that is imported by an entry file and is not itself a real
file on disk to a **story importer** — that is how the webpack/rspack lazy require-context is
recognised. `all: true` hands it three more such records, all imported directly by
`storybook-config-entry.js`:

```
./node_modules/storybook/dist/_browser-chunks/*.js
./node_modules/storybook/dist/csf/*.js
./node_modules/@storybook/react/dist/          <- also the EISDIR record
```

None is a real file, each is entry-imported, so all three become story importers, and every
`node_modules` chunk they import becomes a story file. 3.3.4's stats carry only the two legitimate
importers (`storybook-stories.js` and the `./src/lib|lazy|…` context), which is why it reports 3.

The 40 keys were confirmed to be a property of shape C rather than of the neutralisation, by two
independent transforms of the same stats that preserve different things:

- **vA** — drop the directory record, keep its 137 reason references. 43 story files.
- **vB** — rename the directory to a non-existent sibling, preserving graph topology entirely. 43
  story files, same members.

Both also return the real story hashes to 3.3.4's exact values. An earlier, coarser transform that
also stripped the 137 trailing-slash reasons perturbed `Button.stories.tsx`'s hash; that difference
was an artefact of the transform, not of shape C.

## Bearing on decisions already recorded

- **The `node_modules` story-key question.** [Decide whether a story key the Index can never match
  should count as a story file](https://app.notion.com/p/3b26e816203481428530d347cb62d6a9) was ruled
  out of scope because "no natural trigger was observed … the unsafe globals drain required synthetic
  injection." Shape C **is** a natural trigger: 40 unmatchable story keys from a real builder
  generation with no injection. It does not drain the globals bucket here — `storybookFiles` and the
  `files` set are identical to 3.3.4's, and the only attribution change is three extra
  `storyReachable` members — but the premise of that ruling no longer holds.
- **The version floor.** [Decide whether rspackVersion should anchor and gate rsbuild
  stats](https://app.notion.com/p/3b26e816203481148917d0b9400a752a) declined a floor for want of "a
  proven stats defect." Shape C is now a proven defect on two counts. Note the floor would have to be
  keyed on the builder version, which
  [Does a version-keyed builder gate have a builder name to gate on?](https://app.notion.com/p/3b26e816203481579731d66447070c1c)
  found is reachable only via the `createRequire`-from-`projectRoot` route.
- **Cost.** Shape C stats are 49× larger than 3.3.4's (6.18 MB vs 127 KB) for the same three-story
  project, from `all: true`. Not a v2 walk or hash cost, but it is upload and parse weight.

## Reproducing

The fixture repo cannot pin a second builder generation without disturbing the workspace, so this was
measured on a standalone clone of `ui-rsbuild` — same sources, one vendored workspace import, its own
`node_modules`, its own git repo. Builder generation is the only variable across arms.

```sh
# 1. clone ui-rsbuild's src/ .storybook/ rsbuild.config.ts into a fresh dir
#    replace the '@myorg/shared' imports with a local src/shared/index.ts
#    (exporting User, formatDate, capitalize), then git init && git commit
# 2. storybook must be 10.5.6: builder 3.3.0 peers ^10.1.0 and 3.3.4 peers ^10.3.5,
#    and npm rejects the fixture's 10.6.0-alpha.3 against both (prereleases don't satisfy ranges)
for v in 3.3.0 3.3.1 3.3.4; do
  npm install --no-save storybook-react-rsbuild@$v storybook-builder-rsbuild@$v
  npx storybook build --stats-json
  cp storybook-static/preview-stats.json stats/preview-stats-$v.json   # untracked; copy immediately
done
node <cli>/dist/bin.cjs turbosnap-manifest -s stats/preview-stats-3.3.4.json
node <cli>/dist/bin.cjs turbosnap-bail -s stats/preview-stats-3.3.0.json \
  --builder-name storybook-builder-rsbuild
```

Captured stats and manifests: `~/Projects/turbosnap-v2-artifacts/rsbuild-additive-shim/`.

Two traps worth restating. The framework package pins the builder exactly (`storybook-react-rsbuild@3.3.4`
depends on `storybook-builder-rsbuild@3.3.4`), so both must be pinned together. And
`turbosnap-bail` reports the builder version it resolves from `projectRoot`, which is whatever is
currently installed — not the generation that wrote the stats file being passed to `-s`.

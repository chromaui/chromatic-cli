# F6 — What v2 does with a `node_modules` story file swept in by rspack's require-context

Resolves the wayfinder ticket *What does v2 do with a node_modules story file swept in by rspack's
require-context?* on the **TurboSnap 2.0 — Rsbuild** map. Audit finding F6 was recorded as
`P2 unmeasured`; this measures it.

Measured 2026-08-04 against `chromatic-cli` at `dbacb7e9` (the F1 canonical-key fix — without it
rsbuild detects zero stories and nothing below is observable).

## Answer in one line

**The sweep does not happen on any builder generation** — Storybook core's `(?!.*node_modules)`
`webpackInclude` guard holds on rspack, so no `node_modules` story file enters the graph. If it ever
did, a *self-contained* swept story is cosmetic (a junk key), but a swept story sharing any subtree
with `<storybookGlobals>` **drains those files out of the catch-all** into a key the Index can never
match — an under-capture.

## What was measured

Fixtures: `ui-sb8-rsbuild` (builder **1.0.3**) and `ui-sb9-rsbuild` (builder **2.0.0**) — the two
generations with *no* upstream `webpackExclude` workaround. Both on rspack **1.7.12**.

### 1. The premise is false at the graph level

The fixture needs no synthetic dependency: **`@storybook/react` itself ships 9 `.stories.*` template
files** under `packages/ui-sb8-rsbuild/node_modules` (26 repo-wide). `installConfig.hoistingLimits:
"workspaces"` keeps them unhoisted at the package root. So every Storybook project on earth already
has the input F6 is about.

Two independent reasons nothing is swept:

- **The context root is the glob's base.** With `stories: ['../src/lib/**/*.stories.*']` the generated
  entry imports from `<cacheDir>/../../../src/lib/`, so rspack enumerates `src/lib` — which contains
  no `node_modules`.
- **The include guard holds.** Placing `node_modules/fake-dep/Widget.stories.tsx` *inside* `src/lib`
  — so the file is unambiguously inside the enumerated tree and matches the glob — leaves the graph
  **byte-identical** (45 modules on 1.0.3, 59 on 2.0.0, `fake-dep` absent from both). rspack applies
  `webpackInclude` against the full resource path, so the leading `(?!.*node_modules)` rejects it.

A third, unrelated observation while probing: moving the glob base to the package root
(`'../**/*.stories.*'`) makes Storybook core generate an include regex requiring a literal `/..` in
the resource path, which matches nothing — **zero stories detected**. That is a core glob→regex
property, identical on webpack, not an rsbuild finding. Recorded so nobody re-derives it.

### 2. What v2 would do if a swept key did appear

Measured by injecting swept-story modules into the **real** `ui-sb8-rsbuild` stats (reasoned from the
real require-context module, hashed against real files on disk — the map's synthetic-stats
instrument), then diffing manifests.

A swept file *is* detected as a story: it has a real hash and its reason names the require-context,
which is all `buildManifest` requires (`manifest.ts:146`). Both key shapes appear verbatim:

| Injected | Resulting `storyFiles` key |
|---|---|
| package-local `node_modules` story | `./node_modules/@storybook/react/template/cli/js/Button.stories.js` |
| hoisted (out-of-project) story | `../../node_modules/@storybook/react/template/cli/js/Header.stories.js` |

**Self-contained swept story (imports only its own files) — cosmetic.** Two junk keys added; no file
left `<storybookGlobals>`; the globals roll-up, the preview roll-up and both real story hashes are
**unchanged**. Only `storybookHash` moves, because keys participate in the identity gate — correct by
design for an added file, and safe.

**Swept story sharing a subtree with the globals bucket — under-capture.** One swept story importing
`@storybook/react/dist/entry-preview.mjs` moved **12 of the 14** `<storybookGlobals>` members into
that story's roll-up:

```
entry-preview.mjs, chunk-TENYCC3B.mjs, chunk-XP5HYGXS.mjs, react-dom-shim/react-18.mjs,
react-dom/{index,client,test-utils}.js, react-dom/cjs/{react-dom,react-dom-client,
react-dom-test-utils}.production.js, scheduler/index.js, scheduler/cjs/scheduler.production.js
```

`storybookGlobals` membership is defined by *absence* from `storyReachable`/`previewSubtree`
(`storybookFiles.ts:83-85`), so this is the mechanism, not an accident. After the drain, a change to
`react-dom/index.js` changes only an unmatchable `storyFiles` entry: no matched story recaptures, and
the catch-all that used to force a full recapture no longer contains the file.

### 3. The two guards the ticket asked about

- **`countNodeModulesFiles`** — swept files can only *increase* it, so the `noNodeModulesFiles` bail
  gets less likely to fire, never wrongly. No behaviour change.
- **`noStoryFiles`** (`storyFileHashes.size === 0`, `index.ts:271`) — junk keys would suppress it.
  **Unreachable via this route**: swept stories arrive through the same require-context as the real
  ones, so they are detected iff it is; junk-only detection can't occur. The one residual shape is a
  multi-glob config where one context is degenerate and another's base includes `node_modules`.
  Code-decisive reasoning, not measured — per the map's trap 1 the harness runs no bails.

### 4. Manifest size

Not a concern. The include regex constrains matching to `*.stories.*` regardless of enumeration, so
the population is *story files under node_modules* — 9 in this package — not the 14,134-file tree.
rspack's enumeration of that tree is a build-time cost upstream owns (`rspack#14576`), invisible to
the manifest.

## Reproduction

Fixture edits were reverted; both `preview-stats.json` files were restored to their pre-probe
checksums (`72e143f5…`, `9adf239c…`) and the fixture repo's git status is unchanged.

```bash
# graph-level: does anything get swept?
#   add packages/ui-sb8-rsbuild/src/lib/node_modules/fake-dep/Widget.stories.tsx
#   build from the package dir with the workspace-root bin on PATH, then grep the stats for fake-dep
# manifest-level: what happens if a swept key appears?
#   inject modules whose single reason names the require-context module, then
CHROMATIC_CLI=<worktree>/dist/bin.cjs gen.sh ui-sb8-rsbuild out.json <transformed-stats.json>
```

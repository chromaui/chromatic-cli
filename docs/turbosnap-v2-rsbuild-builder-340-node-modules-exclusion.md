# Does `storybook-builder-rsbuild` 3.4.0's `node_modules` exclusion change TurboSnap v2 behaviour?

Resolves the wayfinder ticket *Does builder 3.4.0's node_modules exclusion change TurboSnap v2
behavior?* on the **TurboSnap 2.0 — Rsbuild** map. Follows F6
(`docs/turbosnap-v2-rsbuild-f6-node-modules-stories.md`, on the unmerged
`cody/turbosnap-v2-rsbuild-f6-findings` branch), whose premise this release changes.

Measured 2026-08-04 against `chromatic-cli` at `01be4bc2` (plus a cherry-pick of the
`turbosnap-bail` harness, `e804eb47`), fixture `~/Projects/turbosnap-monorepo`, package
`ui-rsbuild`. Builder **3.3.4** and **3.4.0**, both on rspack **1.7.12**, Storybook
**10.6.0-alpha.3**. Every result below names the builder generation it came from. Re-verified against
`d97fd0ad` (which carries the harness and its repository-root fix): identical manifest, identical
bail rows.

## Answer in one line

**No, for any project v2 already handled — the manifest is byte-identical on 3.3.4 and 3.4.0. But
3.4.0 closes a real v2 under-capture that F6 measured as unreachable**: the `node_modules` story
sweep *does* happen on ≤3.3.x for an unbounded stories glob, and when a swept dependency story
shares a subtree with `<storybookGlobals>` it drains the catch-all into a key the Storybook index
never contains.

## 1. On a normal stories glob, the release is inert

Two real builds of the same fixture, same source, glob
`../src/lib/**/*.@(mdx|stories.@(js|jsx|ts|tsx))`:

| | builder 3.3.4 | builder 3.4.0 |
|---|---|---|
| stats modules | 242 | 242 |
| `storybookHash` | `ce4b5cbeecf3013e` | `ce4b5cbeecf3013e` |
| story files detected | 3 | 3 |
| manifest files | 203 | 203 |
| attribution (storyReachable / previewSubtree / storybookGlobals) | 151 / 2 / 51 | 151 / 2 / 51 |
| `countNodeModulesFiles` | 217 | 217 |
| `turbosnap-bail` | `fallback`, reaches the Index upload | `fallback`, reaches the Index upload |

Story detection, attribution, node-modules counting and bail behaviour are all unchanged. Three
things in the release that *could* have moved v2 and do not:

- **The context module's name changes.** The generated require-context now carries an extra
  segment: `…|include: /(?!.*node_modules)…/|exclude: /[\\/]node_modules[\\/]/|chunkName: …`.
  `isLazyContext` keys on `|lazy|`, which survives, and the context is synthetic so it is pruned
  before hashing — hence the identical `storybookHash`. `countNodeModulesFiles` counts *names*
  containing `node_modules`, not occurrences, so the second occurrence adds nothing.
- **Flat preview output (#522).** Assets move from `static/js/…` to the output root. v2 hashes
  source files off disk and never reads asset names.
- **`resolve.conditionNames` gains `storybook`, `stories`, `test`.** No module resolved differently
  in this fixture (203 files, identical set). A project shipping those export conditions would get a
  different graph, which v2 hashes correctly either way — not a hole, just a graph difference.

**Full vs minimal stats.** The shim (`withChromaticMinimalContract`) is byte-identical between
3.3.4 and 3.4.0 and still unconditional, so 3.4.0 emits only the reduced shape. Bypassing it in the
installed build (patch `dist/index.js` to return the stats unchanged) yields 234 raw module records
instead of 242 — and **the same manifest**: same `storybookHash`, same 3 stories, same 203 files,
same attribution. The new `exclude:` segment appears in both shapes and is inert in both.

## 2. F6's premise is refuted for unbounded globs — and that is what 3.4.0 fixes

F6 concluded *"the sweep does not happen on any builder generation"*, because core's
`(?!.*node_modules)` `webpackInclude` guard held. That holds only when the emitted include regex
has a **slash-bounded** directory prefix. Upstream's own fix (`#506`) says why: core strips the
leading `^`, so the guard is unanchored and the regex engine can simply start matching *after* the
`node_modules` segment.

Reproduced on the fixture with a look-alike alternation glob,
`../@(modules|src)/**/*.@(mdx|stories.@(js|jsx|ts|tsx))`, which core emits as `(modules|src)` with
**no leading slash** — so it matches inside `node_modules` — plus a planted dependency story at
`packages/ui-rsbuild/node_modules/fake-dep/Widget.stories.tsx`:

| builder | swept module in stats | v2 story files |
|---|---|---|
| 3.3.4 | `./node_modules/fake-dep/Widget.stories.tsx` | **4** (3 real + the swept one) |
| 3.4.0 | none | 3 |

On 3.4.0 the whole manifest returns to the clean baseline — 242 modules, 203 files, attribution
151 / 2 / 51 — with the same glob and the same planted file. The exclusion works.

**The swept key is genuinely unmatchable.** Storybook's `index.json` for that same 3.3.4 build
contains 9 entries, all under `./src/lib/…`; the swept story is absent. The *indexer* excludes
`node_modules`, the *bundler's* require-context did not.

### The unsafe case is naturally reachable on ≤3.3.x

F6 reached the globals drain only by injecting synthetic modules. It happens on a real build:

- **Swept story importing nothing shared** — cosmetic. One extra `storyFiles` key; globals stay at
  51; nothing re-homed.
- **Swept story importing `react-dom/client`** — drain. 6 files leave `<storybookGlobals>`
  (51 → 45) into the swept story's roll-up: `react-dom/{index,client}.js`,
  `react-dom/cjs/{react-dom,react-dom-client}.production.js`, `scheduler/{index.js,cjs/…}`.

The consequence, measured by editing `node_modules/react-dom/index.js` and regenerating both
manifests from their own stats:

| | clean build | swept build (drain) |
|---|---|---|
| `<storybookGlobals>` roll-up | **changed** | unchanged |
| story hashes changed | 0 | 1 — `./node_modules/fake-dep/Widget.stories.tsx` |

In the clean build the catch-all moves, so the change reaches every story. In the swept build the
only thing that moves is a story hash for a story the Index has never heard of, so the Index drills
in and attributes the change to nothing. A shared runtime file changed and **no story recaptures** —
the under-capture F6 predicted, without any synthetic help.

## 3. What this means for the map

- **No CLI change is needed for 3.4.0 itself.** It is a no-op for v2 on projects v2 already handled,
  and it moves rsbuild *toward* webpack (where `RequireContextPlugin` has always dropped these
  candidates) — which is the map's destination.
- **The out-of-scope ruling on *Decide whether a story key the Index can never match should count as
  a story file* rested on "no natural trigger was observed."** A natural trigger now exists on
  builders **1.x, 2.x and 3.0–3.3.x**, all of which the version survey found live. It needs a fresh,
  CLI-side question: whether v2 should refuse `node_modules` story keys, and on which generations.
- **Prevalence is unmeasured.** It needs a stories glob whose directory prefix is not slash-bounded
  (an alternation or a bare `**`). The fixture had to be modified to produce one, and the warehouse
  records no stories globs, so nothing here says how many real projects are exposed.

## Reproduction

```bash
# 1. Pin the builder generation (root package.json: storybook-react-rsbuild), then
yarn install
cd packages/ui-rsbuild && PATH="../../node_modules/.bin:$PATH" storybook build --stats-json

# 2. Manifest + bail for that build
CHROMATIC_CLI=<worktree>/dist/bin.cjs bash docs/turbosnap-v2-harness/gen.sh ui-rsbuild out.json
node <worktree>/dist/bin.cjs turbosnap-bail -b packages/ui-rsbuild

# 3. The sweep: set the glob to '../@(modules|src)/**/*.@(mdx|stories.@(js|jsx|ts|tsx))' and add
#    packages/ui-rsbuild/node_modules/fake-dep/Widget.stories.tsx (import react-dom/client for the
#    drain variant), rebuild, then diff manifests with attrdiff.mjs / tsdiff.mjs.

# 4. Full (unshimmed) stats: patch node_modules/storybook-builder-rsbuild/dist/index.js so
#    withChromaticMinimalContract returns its argument, rebuild, restore the file afterwards.
```

Fixture restored: `packages/ui-rsbuild/.storybook/main.ts` reverted, `fake-dep` removed,
`node_modules/react-dom/index.js` and the builder's `dist/index.js` restored by checksum,
`storybook-static/` restored byte-for-byte (`preview-stats.json` = `cf233b28…`), `yarn.lock` and
`package.json` identical to their pre-probe state, builder back at 3.4.0.

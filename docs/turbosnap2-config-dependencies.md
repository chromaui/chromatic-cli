# TurboSnap 2 configuration dependencies

TurboSnap 2 can treat a file under the Storybook config directory as a story dependency when the
builder proves it is not also a build input. TurboSnap 1 is unchanged. Existing `untraced` values,
traversal boundaries, the main-config exception, and `externals` precedence remain in force.

## Supported coverage

The Storybook Vite producer supplies `turbosnapConfig` alongside the existing preview stats. Its
first complete profile is a declarative `@storybook/html-vite` configuration using Vite 7.3.6 with esbuild 0.28.1 and Rollup 4.53.2, the known
built-in presets/plugins, and JavaScript, TypeScript or JSON preview inputs. Custom addons, presets,
Vite configs, styles, queried modules such as workers, opaque runtime inputs, HTML sidecars and
static/public assets are unsupported
by this initial proof. Unsupported inputs produce incomplete evidence and retain directory coverage.
Other frameworks and builders need their own producer validation before selective coverage applies.

| File role | Coverage with verified evidence |
| --- | --- |
| Reached only by stories | Dependent stories |
| Preview/global dependency or build input, including dual-use helpers | All stories |
| Main, preview, preview HTML, unknown or unattributed config file | Existing global coverage |
| Explicit external or configured static asset | Existing global coverage |
| Explicit `untraced` exclusion | Existing exclusion behavior |
| Missing, stale, malformed or incomplete evidence | Existing directory sweep |

Manager-only and unused files remain conservative. Absence from preview stats does not establish
that a file is unused. A root Vite transform, compiler sidecar, plugin or preset can read a helper
without introducing a runtime import edge.

## Evidence contract

Version 1 identifies the builder and Vite versions, project/config roots, complete config-directory
inventory, absent implicit control files, and build roots with dependency edges. Each source record
binds its bytes with SHA256 and records its resolved filesystem identity. The record also binds the
exact preview module list and the resolved environment/define values. It contains no raw environment
values. The producer rejects pipelines it cannot account for, including unsupported dynamic reads.

The CLI validates package versions, roots, graph references, inventory, absence assertions, source
bytes and symlink identities before using the evidence. Resolved compiler package manifests and discovered lockfiles also
contribute to global coverage. Custom compiler binaries are unsupported; same-version patched
compiler packages remain outside the initial supported contract. Build inputs are hashed as literal paths;
bundler query and loader normalization must not change their filenames. Missing or unreadable proof
falls back to the original directory sweep. Any excluded build dependency also forces that fallback,
so the opaque environment digest cannot bypass an explicit exclusion. Excluded story helpers retain
their existing behavior.

Validation fingerprints never enter capture hashes. The selected build inputs use the normal capture
hashes under `buildConfiguration`, together with the producer capability and resolved environment
hash. `configDependencyVersion` versions this coverage contract. Entering or leaving verified mode
changes the global hash once, preventing reuse across incompatible coverage rules.

## Inspecting a build

Run `chromatic turbosnap-manifest` after a fresh Storybook build with stats. `configAnalysis` includes:

- `mode`: `dependencies` for verified coverage, otherwise `directory`.
- `reason`: the verification result or conservative fallback reason.
- `entryFiles`: main, preview and preview HTML files at the config-directory root.
- `globalFiles`: config helpers reached by preview, build inputs, static directories or externals.
- `storyScopedCandidates`: config files reached only through stories in the runtime graph.
- `unattributedFiles`: config files whose role is not established.
- `buildFiles`: verified build inputs, including files outside the config directory.

The first four file categories partition the original hashed config sweep; they exclude skipped
files. In `dependencies` mode the candidates are removed from `storybookConfigFiles`. In `directory`
mode they remain globally hashed. `buildFiles` is a separate list and may overlap the categories.
Consult `skippedFiles` for exclusions. A candidate in directory mode is diagnostic, not a promise
of selective capture. For an incomplete producer record, inspect `turbosnapConfig.reason` in the
preview stats for the specific unsupported input.

## Migrating existing untraced settings

An upgrade never removes or changes a customer's explicit exclusions, including `.storybook/**`.
Keep fixtures and helpers in the config directory; relocating them is not the migration path.

1. Check that the project's builder produces complete evidence. A broad config exclusion can make
   the current manifest report `excluded-build-dependency` because it also matches main config.
2. On a trial branch, remove only exclusions added to avoid directory-wide recaptures. Retain
   intentional unrelated exclusions. Build Storybook again and inspect the manifest.
3. Require `mode: "dependencies"` before expecting fewer captures. Unsupported projects still get
   directory-wide coverage after removing exclusions.
4. Run a forced-full visual build to establish coverage, then test a story-local edit and a global
   edit. The local edit should select its dependents; the global edit should select all stories.

## Validation and release gates

Consumer tests cover story-local and dual-use files, global inputs, exclusions, custom config roots,
contract transitions and byte-identical fallback. Real-filesystem tests cover source deletion,
new implicit configs and identical-byte symlink retargeting. Producer tests reject unsupported
pipelines and inputs. A real Storybook build and the shipped CLI bundle must also be checked together;
source-only tests do not establish protocol compatibility.

Before broad rollout or adding a supported framework/builder, compare selected stories against
forced-full visual runs. Include fixtures, mocks, decorators, main imports, presets, compiler/style
configs, static assets, additions/removals/renames, custom config directories, monorepos and symlinks.
Every changed visual result must be selected. Start with shadow decisions and a canary with periodic
forced-full comparisons and a kill switch. Track fallback reasons, selected/full counts and broad
exclusions separately for builds and projects. These production rollout controls and visual oracle
runs are release requirements; this local implementation does not provision them.

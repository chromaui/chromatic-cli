# TurboSnap 2 configuration coverage

TurboSnap 2 can waive a `.storybook` directory bailout when uploaded-output evidence proves it is
safe to skip unaffected stories. The release scope covers `@storybook/react-vite`,
`@storybook/react-webpack5`, `@storybook/nextjs-vite`, and `@storybook/nextjs`. TurboSnap 1 is unchanged.

The CLI retains its existing source hashes, config-directory sweep, `untraced` boundaries,
gitignore handling, main-config exception, and `externals` precedence. Output evidence is a separate
optional comparison. It cannot independently request more captures than the existing hashes would.

## How selection works

The CLI identifies config files reached only through stories, excluding entry files, preview/global
dependencies, configured static files, and explicit externals. It supplies a `stableConfigHash`
that omits those candidates, alongside the original full config hash.

For each current/ancestor pair, the backend applies these rules:

1. If the original global hashes match, use the original source-story comparison. Output-only
   changes do not force captures, preserving explicit exclusions.
2. If only the config-directory hash differs, both builds must have compatible, complete evidence.
   Their `stableConfigHash` and `globalOutputHash` must match. Otherwise retain the full bailout.
3. Under that waiver, a story can inherit only if both its source hash and final output hash match.
   A hidden compiler read that changes another story's output therefore prevents skipping it.

The same comparison applies to the upload's ancestor union and each test's most recent ancestor.
The backend's `turboSnapConfigCoverage` account flag defaults to off. It controls these waivers
independently of the existing TurboSnap 2 flag; evidence is stored while the new flag is off.
An older server that rejects the optional `configCoverage` input receives a retry with only the
original fields. Other errors are not downgraded.

| Change | Coverage |
| --- | --- |
| Story-scoped config helper; shared output unchanged | Stories whose source or output changed |
| Preview/global output change during a config-directory waiver | Existing full capture |
| Main, preview, unknown or unattributed config file | Existing global coverage |
| Explicit external or configured static asset | Existing global coverage |
| Excluded-only edit | Existing exclusion behavior |
| Missing, stale, malformed or incomplete evidence | Existing directory sweep |

Manager-only and unused files remain conservative. A runtime import graph does not prove the
absence of build-time reads. The producer fingerprints the final output rather than claiming to
observe every filesystem read made by a framework, compiler, loader, or plugin. Shared CSS and
unclassified assets are global; changing them may retain a full capture.

## Evidence contract

The Storybook producer adds `turbosnapOutput` to `preview-stats.json`, without changing its existing
module graph. Version 1 binds the exact module list, project/config roots, config inventory and
source SHA256 digests, and the final uploaded file inventory and raw SHA256 digests. It also supplies
canonical global and per-story output digests. Only known generated output references may be
canonicalized; arbitrary user strings must retain their bytes. Unknown or ambiguous output shapes
produce incomplete evidence. The producer may normalize `generatedAt` in the exact core-generated
`project.json` and the generation duration in core's diagnostic `components.html`. The latter uses
the generator's canonical rendering with `durationMs: 0`, preserving the remaining payload. Both
exceptions require the complete raw file to match the bytes produced by core. Rendering diagnostic
build timestamps or generation durations is outside the selective-output contract.

Core finalization runs after preview building and other output effects. The CLI verifies the
inventory and bytes before accepting the evidence. Prebuilt output is supported without installed
builder packages. Metadata cannot choose a filesystem root: sources are confined to the independently
discovered Git root, and output to the independently configured build directory. Both lexical paths
and actual symlink targets must remain inside their boundary. Strict inventory enumeration rejects
unreadable entries, cycles, and non-regular files. Binding reads use validated regular-file descriptors
and no-follow flags where supported. These checks protect against untrusted metadata on a stable
filesystem; they are not an atomic sandbox against concurrent replacement of ancestor directories.

The exact stats file and `.chromatic/` internal metadata are excluded from the output inventory.
A file added, removed, or changed after finalization invalidates the evidence. The builder identity
and protocol version are included in the global comparison. The optional coverage record also enters
`storybookHash` identity so storage deduplication cannot discard different evidence for the same
source hashes. Source comparison still controls whether output evidence is consulted.

## Inspecting a build

Run `chromatic turbosnap-manifest` after `storybook build --stats-json`. For custom paths, pass
`--stats-file <file>` and `--storybook-build-dir <directory>` separately; the output boundary is not
inferred from metadata or from an arbitrarily located stats file.

`configAnalysis` reports:

- `mode`: `output` when verified evidence is available, otherwise `directory`.
- `reason`: the verification result or fallback reason.
- `entryFiles`: main, preview and preview HTML files at the config-directory root.
- `globalFiles`: config helpers reached by preview/globals, static directories or externals.
- `storyScopedCandidates`: config helpers reached only through stories.
- `unattributedFiles`: config files whose role is not established.

The file categories partition the full config sweep and exclude skipped files. Candidates remain
in `storybookConfigFiles` in both modes. A separate `configCoverage` record proposes the conditional
waiver; `mode: "output"` is not itself proof that a particular ancestor permits selective capture.
Inspect `turbosnapOutput.reason` in the stats for producer-specific fallback details.

## Migrating existing untraced settings

An upgrade preserves explicit exclusions, including `.storybook/**`. Fixtures and helpers may stay
in that directory.

1. Upgrade Storybook and the CLI to versions with output evidence, and confirm the backend supports
   the optional coverage input and has enabled `turboSnapConfigCoverage` for the trial account.
   Check for `mode: "output"` on a fresh build.
2. On a trial branch, remove only exclusions added to avoid config-directory recaptures. Retain
   unrelated intentional exclusions.
3. Run a forced-full visual build after removing the workaround. Establish an ancestor with the new
   evidence before measuring savings.
4. Change a story-local helper and check that its dependents are selected. Change preview/global
   configuration and check that all stories are selected. Unsupported output retains full coverage.

If an excluded edit coincides with an ordinary config-helper edit, output differences may prevent
the waiver and retain the old full capture. This loses an optimization but does not expand capture
beyond the original decision.

## Validation and release gates

Unit tests cover source-hash preservation, hidden output effects, malformed/stale evidence,
exclusions, filesystem escapes and legacy-server fallback. Acceptance requires actual Storybook
builds for all four frameworks with JSX, CSS/static assets and normal framework plugins. Test local
helpers, global edits, hidden compiler reads, late output mutations, preview imports of stories,
additions/removals/renames, custom config directories and monorepos.

Before production rollout, compare selected stories with forced-full visual results. Every changed
visual must be selected. Start with shadow decisions, a canary, periodic forced-full comparisons and
a kill switch. Disabling `turboSnapConfigCoverage` restores the existing source comparison for
subsequent decisions; it does not cancel a bypass already decided for an in-flight build. Track
fallback reasons, selected/full counts and broad exclusions per build and project. Local build/CLI
tests do not establish a hosted visual oracle or provision shadow comparisons or rollout monitoring.

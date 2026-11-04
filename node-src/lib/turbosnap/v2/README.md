# How TurboSnap 2.0 manifest hashes decide recaptures

TurboSnap 2.0 is hash-based. The CLI does not decide which stories to capture. It hashes the files behind the Storybook, rolls those hashes up into a few comparable values, and sends them to the index. The index compares them against the ancestor builds' values and decides what to capture.

Read this before changing anything in this directory. Changes here can move hashes and cause recaptures for projects that upgrade, even without changes to their Storybook. See [Changes that reset hashes](#changes-that-reset-hashes).

## The two halves of the manifest

When stats are available and hash collection is enabled, the CLI attempts to build one manifest, even without `--only-changed`. It is used in two ways:

| Half | Fields | Where it goes | Drives recaptures? |
|---|---|---|---|
| Roll-ups | `storybookHash`, `storybookConfigHashes`, `storyFiles` (sent as `storyFileHashes`) | Sent to the index | Yes, these are the hash inputs the index compares; build eligibility and baselines also matter |
| Debug detail | `files`, `storybookConfigFiles`, `staticFiles`, `externals`, `attribution`, `skippedFiles` | Always written to `<storybook-build>/.chromatic/turbosnap-manifest.json`. Uploaded to S3 only when the build's metadata is uploaded: by default only with `--only-changed`, and never with `--no-upload-metadata` | No, they exist to explain a decision after the fact |

The whole serialized manifest, including the roll-ups, is written to that file. Without `--only-changed`, the roll-ups still reach the index, but the manifest does not reach S3. The roll-ups use the per-file hashes recorded in the debug detail, along with path identities and the Storybook version. When a roll-up moves, compare those inputs across the two manifests. `chromatic turbosnap-manifest` prints the same serialized structure locally.

Adding or changing a debug-only field never changes what gets captured. Adding or changing anything that feeds a roll-up always might.

## The roll-up tree

```
storybookHash
├── storybookConfigHashes      one entry per Storybook-wide category
│   ├── preview                = <configDir>/preview.* found in the graph and their imports
│   ├── storybookGlobals       = global graph inputs, plus unreached graph files and their imports
│   ├── storybookConfigFiles   = files in <configDir>, except .md and .txt, read off disk
│   ├── staticFiles            = configured static files and directory contents, read off disk
│   ├── externals              = every git-tracked file matching --externals, read off disk
│   └── storybookVersion       = the installed Storybook version string, not a hash
└── storyFiles                 one entry per story file identified by the builder's graph
    └── ./src/Button.stories.tsx   = that story file and everything it imports
```

The tree is subject to the [skip rules](#skipped-files). Global tracing stops at story files and leaves preview's subtree to `preview`; a dependency shared by a story and a global input can still affect every story.

`storybookHash` is a hash of every entry in the other two maps, keys included. It moves when any roll-up moves, and when a story file or category is added, removed, or renamed. It is computed from roll-ups, not directly from the debug detail.

A file can feed more than one entry. A file that both a story and preview import, for example, moves both, and the moved `preview` entry recaptures every story.

A few things the tree doesn't show:

- **Paths matter as well as bytes.** Renaming an input can change a roll-up without changing its contents. Graph roll-ups ignore pnpm store-directory renames when the graph contains only one copy of that package; multiple copies keep their distinct paths. Debug paths and story-file keys keep their actual locations. Graph-only module identities can also contribute to story and preview roll-ups even though they have no file contents and are omitted from the serialized `files` detail.
- **A file in the graph that no story or preview reaches is treated as global.** Builders sometimes leave out the edge from their composition root, so "unreached" usually means "reached by something the stats don't show". Treating it as global over-captures instead of missing a change. Files behind an `--untraced` wall are the exception; see [Skipped files](#skipped-files).
- **The off-disk entries exist because some inputs never appear in the module graph.** `main.ts` is Node-side config and static assets are referenced by URL, so no module hash can see them change. `preview.*` is covered twice on purpose: by its imports in `preview` and by its bytes in `storybookConfigFiles`.
- **The Storybook version is tracked as a string** because on some builders the preview runtime is served outside the module graph, so no file hash would see an upgrade. If no version can be resolved, building the manifest fails rather than silently under-capturing.
- **`package.json` and lockfiles have no special roll-up.** Dependency changes are normally detected through the installed files in the graph, avoiding recaptures on lockfile churn alone. A package manifest or lockfile is still hashed if it appears in the graph or an off-disk sweep, including `--externals`.
- **Categories with no files are left out** of `storybookConfigHashes`. `storybookConfigFiles` and `storybookVersion` are always present, because the index requires them.

## What the index does with the roll-ups

This section describes another service, so it can drift from what is written here. Treat it as the model to design against, not a specification.

Each story is judged on its own, against the build its baseline came from. It is recaptured when any `storybookConfigHashes` entry or its own `storyFiles` hash differs from that build. Baselines can come from different builds, so two stories in the same build can be compared against different ancestors. A story whose hash matches the parent build can still recapture because its baseline came from an older one.

`storybookHash` is a shortcut, not a step in that decision: when it matches the ancestors, nothing hashed changed and the build may be bypassed, capturing nothing at all.

The index stores uploaded hashes for later builds, but only evaluates them when `--only-changed` is requested. It decides whether hash-based TurboSnap is applied and tells the CLI. The CLI still runs git-based tracing when eligible and sends that result too, so a failure to build, write, or upload the manifest never fails the build.

## Skipped files

Some on-disk files are deliberately not content-hashed. There are two reasons, recorded in the manifest's `skippedFiles`:

| Reason | What it means | Its own bytes | Its imports |
|---|---|---|---|
| `untracked` | Git reports it as untracked within the repository, ignored or not. Usually generated output, which can change on every build. | Feed no roll-up | Keep their edges, so a tracked file imported through a generated barrel still rolls up into the story |
| `untraced` | Matches an `--untraced` glob. The user asked that changes here not recapture stories. | Feed no roll-up | Edges are cut, and files reached only through it are excluded from graph roll-ups, including the globals fallback; off-disk sweeps still apply independently |

A skipped file contributes neither its own content hash nor its path to a subtree roll-up. Its path is excluded because generated files are often renamed on every build, so even their path would move the roll-up each time. The file stays in the graph so the edges through an untracked file still connect a story to the tracked files behind it. A skipped story file still has an entry in `storyFiles`, and adding, removing, or renaming that key still moves `storybookHash`. For an untracked story file, its tracked dependencies can move its hash. An untraced story file has its edges cut, so its hash never moves.

The globs for `--untraced` and `--externals` are relative to the git root. Skip rules follow symlinks to the real file, so a linked workspace package's generated output is still untracked. An external glob on that untracked output does not help: use its tracked source to detect changes Storybook-wide. Files outside the repository are not classified as untracked by this repository's git listing.

Exceptions:

- Installed packages under `node_modules` are hashed even though they are gitignored, since a dependency upgrade is a real change. They can still be excluded with `--untraced`. Generated directories under `node_modules`, such as `.federation`, are not exempt from the untracked rule.
- The main config (`<configDir>/main.*`) is always hashed into `storybookConfigFiles`, whatever the skip rule says.
- Externals ignore the skip rule. A file that is both untraced and external still moves the `externals` entry.
- Uncommitted edits do not make a tracked file untracked; it is still hashed unless explicitly untraced.

## Story-file keys are a cross-repo contract

The keys in `storyFiles` must match how the index names story files: relative to the Storybook project root and prefixed with `./`, or `../` for files outside the project root, like Storybook's own import paths. Changing how those keys are spelled is the riskiest change in this directory. A mismatch doesn't necessarily cause a recapture: stories can look unchanged instead, and silently stop being recaptured. Coordinate any such change with the index before shipping it.

## Changes that reset hashes

Changing how a roll-up is computed can move it even when no user file changed. A change to the hash format can affect every project; a change to which files contribute affects only projects with those inputs. Their first builds on the new CLI can then recapture against ancestors built with the old one. Because users pin CLI versions and upgrade on their own schedule, this happens project by project. It can also repeat when branches of the same project run different CLI versions.

What moves and what it costs:

| Change | Moves | Effect on the first build after upgrading |
|---|---|---|
| The shared content-hash or roll-up format | All entries using that format | Full recapture if a config entry moves, otherwise the affected stories |
| How file paths are named in a roll-up | Any roll-up containing an affected path | Full recapture if any config entry moves, otherwise the affected stories. For `storyFiles` keys, see [the contract above](#story-file-keys-are-a-cross-repo-contract) |
| Which files land in a `storybookConfigHashes` entry | That entry, for projects with affected inputs | Full recapture |
| Which files land in a story subtree, or what the skip rule skips | Affected story and/or config entries; a file can move between them | Full recapture if a config entry moves, otherwise the affected stories |
| Adding, removing, or renaming a `storybookConfigHashes` key | The config map | Full recapture |
| How the debug detail is written to `turbosnap-manifest.json` (format, ordering, which entries it lists) | Nothing | None |

When making one of these changes:

- Say so in the PR description, so users know why one build recaptured.
- Batch roll-up changes into one release, and keep unrelated changes out of it, so each reset is traceable to one version.
- Expect the golden hash test to fail when the change affects its fixture. It pins that project's roll-ups, not every possible input. Update its values only when the move is intended.

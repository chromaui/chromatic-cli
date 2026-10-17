# TurboSnap v2

TurboSnap v2 decides which stories a build must recapture by hashing what each story is built from and letting the Index compare those hashes with the ones recorded for the build's baselines.

## Sources

**Stats file**:
The builder's record of the modules it bundled into the Storybook preview (`preview-stats.json`), in that builder's own spelling of each module.
_Avoid_: preview stats, webpack stats

**Stats graph**:
The stats file read into canonical, project-relative paths: every module the builder named, and what each one imports.
_Avoid_: module graph, dependency graph

**Graph file**:
A file the stats file names, so a change to it can be traced to the stories that import it.
_Avoid_: bundled file, module

**Out-of-graph file**:
A Storybook input the bundler never emits a module for: a file in the config directory, a static file, or an external.
_Avoid_: config file, static asset

**External**:
A file the user names with `--externals` because it affects the built Storybook in a way no trace can see, such as a Tailwind config.

## File kinds

**Hashed file**:
A file on disk whose bytes were hashed.

**Skipped file**:
A file on disk that v2 deliberately leaves unhashed, because git ignores it or the user untraced it. Its bytes feed no roll-up.
_Avoid_: ignored file, which names only one of the two reasons

**Synthetic file**:
A node in the stats graph with nothing on disk: a require-context glob, a virtual module, an external module request or an inline `data:` URL.
_Avoid_: virtual file, fake file

**Untraced file**:
A skipped file the user named with `--untraced`. A change behind it reaches a story only through some other import path.

**Untraced wall**:
What an untraced file is to tracing: neither its own changes nor those of files reached only through it recapture any story.
_Avoid_: cut-off, barrier

## Hashes

**Roll-up**:
One hash folded from a set of files' paths and content hashes, so that a change, addition, removal or rename of any of them moves it.

**Story hash**:
The roll-up of one story file and everything it transitively imports.
_Avoid_: story file hash

**Preview subtree**:
The project's `<configDir>/preview.*` file and everything it transitively imports.

**Storybook globals**:
The graph files that can affect every story outside the preview subtree: what the builder's composition roots reach, and any other hashed file that is in no story's subtree, not in the preview subtree and not behind an untraced wall.
_Avoid_: global files, shared files

**Storybook-wide roll-up**:
A roll-up whose change can affect every story: the preview subtree, the Storybook globals, the config directory, the static files and the externals. The installed Storybook version sits beside them as a plain version string.
_Avoid_: config hash

**Storybook hash**:
The roll-up of every story hash and Storybook-wide roll-up: the Index's first check of whether anything changed at all.

**Manifest**:
Everything above for one build: the hashes sent to the Index, and the per-file detail written beside the build to explain a recapture afterwards.

**Index**:
Chromatic's backend service that compares a build's hashes with those of its baselines to decide which stories to recapture.

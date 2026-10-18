# TurboSnap v2 is one folder per concept

TurboSnap v2 is split into one folder per concept: `graphFiles`, `outOfGraphFiles`, `manifest`, `projectFiles`, `skippedFiles`, `rollUps` and `paths`. Each folder is used only through its `index.ts`, which exports by name what the rest of v2 needs from it, and code outside v2 uses only v2's own `index.ts`. ESLint's `no-restricted-imports` enforces both, for any folder added later as well. The root of v2 holds only the entry point, these docs and test fixtures shared by more than one folder. We did this so that opening v2 shows what it is made of, and so that the code reading a builder's stats file, the hashing rules and the manifest's shape can each change without the others reaching into them.

A concept gets a folder whatever its file count, so `paths` and `skippedFiles` hold one file each. Files are not grouped into a `shared` folder: what several folders use is still a concept of its own, and a folder of unrelated helpers would hide that.

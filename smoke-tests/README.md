# Smoke Tests

A self-contained Storybook used by the `smoke-test-*` CI workflows to verify the
Chromatic CLI works across package managers, Node versions, and platforms.

This directory has its own pinned dependencies and **no committed lockfile** — each
smoke-test workflow installs it fresh with the package manager under test, so the
repo's own dependencies can change without affecting the smoke tests.

## How it works

The CLI is consumed as a packed tarball, exactly as an npm user would get it:

1. At the repo root, the workflow builds and packs the CLI:
   `yarn build && yarn pack --out chromatic.tgz`.
2. `package.json` here declares `"chromatic": "file:../chromatic.tgz"`, so installing
   this directory pulls in the built CLI, providing both `chromatic/isChromatic`
   (used by the stories) and the `chromatic` bin.
3. Chromatic publishes the Storybook built by `build-storybook`.

## Running locally

```bash
# from the repo root
yarn build && yarn pack --out chromatic.tgz
cd smoke-tests
yarn install
yarn build-storybook   # emits ./storybook-static
```

The tarball must exist before installing here (step 1), because the `chromatic`
dependency resolves to `../chromatic.tgz`.

# E2E fixtures

Minimal Storybook projects to run the CLI against: one per builder, one monorepo per package manager, and one E2E project that has no Storybook of its own. Use them to check a change by hand. The merge queue also runs the packed CLI against them (see [In CI](#in-ci)).

The fixtures are deliberately bare. Each Storybook has a `Button` that imports a `Badge`, with one story each. Anything a test needs beyond that, such as a changed dependency or a story outside the package, should be set up by the scenario on a prepared copy, not added here.

## Usage

```sh
yarn build                                # build the CLI into dist/
yarn fixture monorepo-yarn [destination]  # copy, git init, install
```

`yarn fixture` copies the fixture out of this repository, commits it to a fresh git repository and installs it with the fixture's package manager and committed lockfile. The destination defaults to a new temporary directory.

The Yarn fixtures install through Corepack, which Node 22 and 24 bundle. On Node 25 and later, install it first with `npm install -g corepack`. The pnpm fixture runs pnpm through `npx`, so it needs nothing extra.

Each fixture needs its own git history. If you ran the CLI inside this repository, TurboSnap would diff the CLI's own commits.

Then run the local CLI from the Storybook project in the copy (the root for single projects, `packages/ui` for monorepos):

```sh
cd <destination>/packages/ui
node <this repo>/dist/bin.cjs --project-token <token> --build-script-name build-storybook --only-changed
```

To check TurboSnap, run one build as a baseline, then commit a change and run it again.

`react-vitest` is different: its Storybook ships inside `@chromatic-com/vitest`. Install Playwright's Chromium once, run the tests to write the archives, then run the CLI with `--vitest` instead of a build script:

```sh
cd <destination>
npx playwright install chromium
npm test
NODE_PATH=$PWD/node_modules node <this repo>/dist/bin.cjs --project-token <token> --vitest --only-changed
```

`NODE_PATH` lets this repository's bundle load `@chromatic-com/vitest` from the copy, as a `chromatic` installed in the project would.

Run `npm test` again after every change you commit, so the archives and `preview-stats.json` describe that commit.

## Fixtures

Every fixture except `react-vitest` is a React and TypeScript Storybook. Its `package.json` pins the exact versions. Keep each fixture's Storybook packages on the same version as its `storybook`. In `react-rsbuild`, that includes the `@storybook/react` that `storybook-react-rsbuild` pulls in. CI checks this in every `package.json` and lockfile with `node e2e/checkStorybookVersions.mjs`, skipping E2E fixtures, which depend on `@chromatic-com/vitest`, `/playwright` or `/cypress` and pin no Storybook packages of their own. `@storybook/*` packages with their own version numbers, such as `@storybook/icons`, are exempt.

| Fixture                 | Package manager                           | Builder   | Storybook     |
| ----------------------- | ----------------------------------------- | --------- | ------------- |
| `react-vite`            | npm                                       | Vite      | the root      |
| `react-webpack5`        | npm                                       | webpack 5 | the root      |
| `react-rsbuild`         | npm                                       | rsbuild   | the root      |
| `monorepo-npm`          | npm workspaces                            | Vite      | `packages/ui` |
| `monorepo-yarn-classic` | Yarn 1 workspaces                         | Vite      | `packages/ui` |
| `monorepo-yarn`         | Yarn 4 workspaces (`node-modules` linker) | Vite      | `packages/ui` |
| `monorepo-yarn-pnp`     | Yarn 4 workspaces (Plug'n'Play)           | Vite      | `packages/ui` |
| `monorepo-pnpm`         | pnpm 12 workspace                         | Vite      | `packages/ui` |
| `react-vitest`          | npm                                       | Vitest browser mode | `@chromatic-com/vitest` (none in the project) |

Every monorepo has the same three packages:

| Package          | Contents                                                           |
| ---------------- | ------------------------------------------------------------------ |
| `@myorg/ui`      | The Storybook. `Button` imports `capitalize` from `@myorg/shared`. |
| `@myorg/shared`  | One exported function, no dependencies.                            |
| `@myorg/backend` | One file, no dependencies. Nothing imports it.                     |

npm and Yarn 1 have no `workspace:` protocol, so their `ui` depends on `@myorg/shared` by version (`0.0.1`).

The `build-storybook` scripts leave out the stats flag, as most projects do, so the CLI has to add it.

`monorepo-yarn-pnp` installs no `node_modules`: its dependencies stay in Yarn's zip archives or its unplugged folder, reachable only through the `.pnp.cjs` runtime the install writes. Its `main.ts` wraps the framework in `getAbsolutePath(...)`, as `storybook init` writes it for Plug'n'Play. Run the CLI with plain `node` to see what the GitHub Action and `npx` see, or with `NODE_OPTIONS="--require <copy>/.pnp.cjs --experimental-loader <copy>/.pnp.loader.mjs"` to see what `yarn chromatic` sees.

`react-vitest` has the same `Button` and `Badge`, with one Vitest browser test each instead of stories. Each test writes one archive and one `.stories.json` under the gitignored `.vitest/chromatic`. Its `vitest.config.ts` turns on `chromaticPlugin({ turboSnap: true })`, which writes the `preview-stats.json` that TurboSnap reads.

## In CI

The `e2e-fixtures` workflow runs in the merge queue, so no code change merges without it. It packs the CLI once, the same tarball a release publishes, and runs `e2e/checkPackedCli.sh` against each fixture in its matrix, one job each. The script prepares the fixture with `prepare.mjs`, installs the tarball with the fixture's package manager, and checks an invalid token, a first build, and a TurboSnap 2.0 build and a TurboSnap 1.0 build after commits to a file only `Button`'s story depends on, then `trace` and `turbosnap-manifest`. The builds publish to the smoke-test project. To run it yourself against a project of your own:

```sh
yarn build && yarn pack --out chromatic.tgz && yarn clean-package restore
CHROMATIC_PROJECT_TOKEN=<token> e2e/checkPackedCli.sh react-vite chromatic.tgz
```

## Changing a fixture

- Keep fixtures minimal. Add something only when every scenario needs it.
- `checkPackedCli.sh` expects a `Button` and a `Badge` story, and a change to `src/Button.tsx` (or `packages/shared` in a monorepo) to reach only `Button`. A new fixture needs a row in the matrix in `.github/workflows/e2e-fixtures.yml` and an install command in `checkPackedCli.sh`, which refuses fixtures it has none for.
- Pin exact versions and commit the lockfile. That keeps installs reproducible and gives dependency-change scenarios a real lockfile diff. Dependabot's version updates skip `e2e/fixtures/`, but its security updates can still bump a single package there, such as `storybook`, without the packages that must match it.
- To update a lockfile, prepare the fixture, change it and install in the copy, then copy the lockfile back. Installing in place is not recommended: Yarn would pick up this repository's `.yarnrc.yml`.
- Use neutral names (`@myorg/*`, `Button`) and never commit project tokens. This repository is public.
- `smoke-tests/` is separate for now. CI uses it to run one build per package manager, Node version and OS.

# AGENTS.md

Guidance for coding agents working in `chromaui/chromatic-cli`, the `chromatic` npm package (CLI, GitHub Action, and the `chromatic/node` API).

The CLI is how users get their work into Chromatic. It runs in the user's own project, usually in CI. It builds their Storybook (or reads a prebuilt one, an E2E archive, or a React Native app), works out the git context and baseline, uploads the build, and waits for Chromatic's visual tests. Its exit code tells CI whether the build passed. The same pipeline ships three ways:

- The `chromatic` binary (`bin-src/register.js`), which also routes to a few utility subcommands.
- The GitHub Action (`action-src/`, `action.yml`), which maps action inputs to the same options.
- The Node API (`chromatic/node`, built from `node-src/index.ts`). chromaui/addon-visual-tests, the Visual Tests addon for Storybook, calls `run`, `share`, `getConfiguration`, and `getGitInfo` from it. Changes to these exports or to the `Context`, `Options`, and `TaskName` types are breaking changes for that addon.

## This repository is public

Everything you write here is visible to the world, and much of it cannot be fully deleted: PR titles and bodies keep their edit history, branch names stay in the PR timeline, and notifications go out the moment something is pushed or opened.

Work often starts from a Linear ticket or bug report that contains private details. Those details stay there. Never put any of the following into a branch name, commit message, PR title or body, review comment, code comment, test fixture, or CHANGELOG entry:

- Customer or company names, or the names, emails, or handles of people at those companies
- Chromatic app IDs, project IDs, build numbers or URLs, or project tokens (`chpt_…`)
- Customer repository names, file paths, package names, story names, or snippets of their code or config
- Logs, stack traces, or screenshots from customer builds
- Links to Linear, Slack, Intercom, Zendesk, or other internal tools (Linear URLs embed the issue title)

**Exception: Obvious links.** PR bodies may link to Obvious project, thread, and PR-artifact pages (`app.obvious.ai/...`). Those pages are restricted to Chromatic users, and reviewers need them to trace a PR back to the thread that produced it. The carve-out is narrow:

- PR bodies only. Not in branch names, commit messages, code comments, test fixtures, or CHANGELOG entries.
- The URL itself is public even though the page is not. Obvious builds URLs from the ticket title (e.g. `cap-1234-short-summary`), so the slug must meet the same bar as a branch name. If the title names a customer or anything else on the list above, use a neutral project name or leave the link out.
- Never quote or summarize the thread's content in the PR, since that content was written under the assumption that it stays private.

Instead:

- **Reference tickets by identifier only**, e.g. `CAP-1234`. Linear's GitHub integration links it automatically.
- **Name branches after the identifier**, e.g. `<username>/cap-1234` or `<username>/cap-1234-short-generic-summary`. Do not use the branch name Linear suggests; it is built from the issue title.
- **Write PR titles and descriptions from the diff**, describing the behavior that changed, not from the ticket text.
- **Reproduce customer setups generically.** Build fixtures with neutral names (`my-app`, `packages/ui`, `Button.stories.tsx`) and only the structure needed to trigger the bug.
- **Rewrite rather than quote** error messages and logs: keep the part that comes from this CLI, and replace anything that comes from the customer's project with a placeholder.

If you are unsure whether something is identifying, leave it out. If a ticket title itself names a customer, write a neutral title of your own.

## Label every pull request

`check-labels` fails a PR unless it has exactly one label from each pair below, and `auto` reads them to set the version bump and decide whether to publish. Add both when you open the PR (`gh pr create --label <bump> --label <release>`) without asking, and fix them with `gh pr edit` if later commits change the answer. Say which labels you chose and why in your reply.

1. **Version bump, one of `major`, `minor`, `patch`.** Judge it by what users of the published `chromatic` package see.
   - `major`: a breaking change, such as a removed or renamed flag or config option, a changed exit code, changed output that users parse, or a dropped Node version.
   - `minor`: a new flag, option, subcommand, or feature.
   - `patch`: everything else, including bug fixes, performance work, refactors, and changes to docs, tests, CI, and agent files.
2. **Release, one of `release`, `skip-release`.**
   - `release`: a change users of the published package would notice, in `bin-src/`, `node-src/`, `action-src/`, or `action.yml`.
   - `skip-release`: docs, tests, CI, tooling, and agent files (`.agents/`, `AGENTS.md`). Also use it for package changes with no significant user benefit or too small to justify a release on their own; they ship with the next release.

When the user names labels, use theirs. Never add `DO NOT MERGE` unless asked; `check-labels` fails while it is set.

## Verify changes in the real CLI

Unit tests don't show that the CLI behaves correctly for users. Before you call a change to `bin-src/` or `node-src/` that affects behavior or output done, or open or update a PR for it, load the `verify-chromatic-cli` skill (`.agents/skills/verify-chromatic-cli/`) and drive the built CLI through its `control-chromatic` helper. That covers comparing `main` against your branch (`build-ref`), reproducing a bug in an e2e fixture project with another builder or package manager (`e2e-fixture`), and trying a published canary (`install-published`). A refactor or performance change that keeps output identical needs only tests and an explanation. When reviewing, re-run it only if the author's evidence doesn't cover the change. If the helper can't do what the change needs, extend it in the same PR instead of working around it. When you can't verify something, say what and why in the PR.

## Service map

The CLI talks to three things in the Chromatic stack: the index's GraphQL API, the S3 buckets the index hands it upload URLs for, and the notify service. After the CLI publishes a build, the backend runs extract, capture, and diff on the uploaded Storybook. The CLI never calls those services.

```
┌──────────────────────────────────────┐
│ Chromatic CLI (this repo)            │
└──┬──────────────┬─────────────────▲──┘
   │ GraphQL      │ S3 presigned    │ WebSocket:
   │ /graphql     │ POST uploads,   │ build progress
   │              │ sentinel GETs   │
   ▼              ▼                 │
┌──────────────┐ ┌──────────┐ ┌─────┴──────────┐
│ Index        │ │ S3       │ │ Notify service │
└──────────────┘ └──────────┘ └────────────────┘
```

| Service | Role | How the CLI talks to it |
|---|---|---|
| Index (chromaui/chromatic) | Owns apps, builds, tests, and baselines. Hands out upload URLs. Starts backend processing after publish. | Over GraphQL at `${CHROMATIC_INDEX_URL}/graphql` through `ctx.client` (`node-src/io/graphqlClient.ts`). Operations are inline strings next to the code that uses them. |
| Build storage (S3) | Holds the uploaded Storybook, metadata, and shared Storybooks. | The index returns presigned POST targets from `uploadBuild` (and `uploadShare`). The CLI posts files or one zip to them (`node-src/lib/uploadFiles.ts`, `uploadZip.ts`). For zips it polls a presigned sentinel URL until the server-side unpack writes `OK` (`waitForSentinel.ts`). |
| Notify service | Pushes build progress to the CLI. | Over a WebSocket at `CHROMATIC_NOTIFY_SERVICE_URL` (`node-src/lib/waitForBuildToComplete.ts`). If the socket fails, the CLI falls back to polling `SnapshotBuildQuery`. |

The CLI also reports errors to Sentry (`node-src/errorMonitoring.ts`), sends telemetry through the index's `TrackCLITelemetryEvent` mutation, and checks the npm registry for newer versions (`node-src/lib/checkForUpdates.ts`).

## Feature map

One row per user-facing flow. [`.agents/skills/verify-chromatic-cli`](.agents/skills/verify-chromatic-cli/SKILL.md) holds the recipes for driving the flows it covers and proving they work. Its [`features/`](.agents/skills/verify-chromatic-cli/features/README.md) index lists which flows those are. This table is for finding where a flow lives.

| Flow | Entry point | Path | Outcome | Code |
|---|---|---|---|---|
| Publish a build | `chromatic` with no subcommand. Also the Action and `run()` in `chromatic/node`. | `run()` → `runBuild()` in `node-src/index.ts`, which calls each step's `render*` in order: auth (`createCLIToken`) → gitInfo (baselines, `--skip`) → storybookInfo → initialize (`announceBuild`) → build (runs `build-storybook` unless `--storybook-build-dir`) → prepare (file hashes, TurboSnap) → upload (`uploadBuild` + S3) → verify (`publishBuild`, poll until started) → snapshot (notify, then poll until complete) → optional JUnit `report`. | A build on Chromatic. The exit code comes from `node-src/lib/setExitCode.ts`: 0 passed, 1 changes, 2 errors, and more. | `node-src/tasks/*` (logic), `node-src/renderer/*` (terminal UI), `node-src/ui/messages/*` (user-facing text) |
| TurboSnap | `--only-changed` on the main command | prepare traces changed git files through `preview-stats.json` to affected story files, and upload sends them as `onlyStoryFiles`. | Only affected stories are captured. Others inherit baselines. | `node-src/lib/turbosnap/`, `node-src/tasks/prepare/traceChangedFiles.ts`, `node-src/git/` |
| E2E build | `--playwright`, `--cypress`, or `--vitest` on the main command | build runs the test framework's `build-archive-storybook` over its test archives instead of the user's Storybook. | Same as a Storybook build. | `node-src/lib/e2e.ts`, `node-src/tasks/build/` |
| React Native build | Main command for a project the index marks `isReactNativeApp` | build runs the Android or iOS app build and generates a story manifest. prepare validates the artifact. | Same as a Storybook build. | `node-src/lib/react-native/`, `node-src/tasks/build/buildReactNative.ts` |
| Share a Storybook | `share()` in `chromatic/node` (used by the Visual Tests addon) | Reserve a share (`UploadShareMutation`) → build → upload to the share bucket → `ConfirmShare`. No Chromatic build or tests. | A temporary share URL. | `node-src/share.ts`, `node-src/lib/share/`, `node-src/tasks/uploadShare.ts` |
| Utility subcommands | `chromatic trace`, `turbosnap-manifest`, `trim-stats-file`, `generate-manifest`, `react-native-build`, `init` | `bin-src/register.js` routes `argv[2]` to `bin-src/<command>.ts`. These do not call Chromatic services. `init` edits `package.json` and installs packages from the registry. | Printed output or written files. | `bin-src/`, reusing `node-src/lib/*` |

## Cross-repo contracts

- Users pin CLI versions in their projects and upgrade on their own schedule, so the index keeps serving old CLIs long after a release. A CLI change that needs a new GraphQL field or argument only works once the index has shipped it, so check chromaui/chromatic before relying on it.
- Build fields the CLI queries with an app token must be allowed by the index's `authorizedBuildFieldsViaAppCode`. A new field in a CLI build query fails authorization until it is added there.
- The exit codes in `node-src/lib/setExitCode.ts` are documented in chromaui/chromatic-docs. Keep the two in sync.

## Architecture decisions

Architecture decision records live in `docs/adr/`. Read the ones that touch your area before changing how the pipeline works or questioning a design choice. They explain why the code works the way it does.

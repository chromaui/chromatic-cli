# Required baselines and verified bypass: CLI groundwork

This branch implements local validation for two experimental options. **The server protocol is not integrated. Valid opted-in invocations stop with exit code 3 before announcement, Storybook execution, or capture. These options are not ready for customer CI.**

| Option | Intended behavior after server integration |
| --- | --- |
| `--require-baseline <sha>` / `requireBaseline` | Require a usable build for the exact main commit supplied by CI, and bind that dependency to the build's ancestry. |
| `--bypass-if-unchanged` / `bypassIfUnchanged` | Build Storybook and let the server verify unchanged inputs before finalizing an inherited build for the current commit. |

Both options work through CLI flags, configuration, and programmatic options. Existing precedence applies: programmatic options override CLI flags, which override configuration. Supply the dynamic required SHA in each CI invocation rather than storing a stale SHA in configuration.

The implemented checks are:

- A required commit is a full SHA-1 or SHA-256 ID matching the repository's object format, resolves directly to a commit object, and is an ancestor of the tested commit. Abbreviations, refs, tag/tree/blob IDs, self-dependencies, and unrelated commits are rejected. Missing objects or insufficient shallow history produce fetch instructions. Git failures remain distinct from a proven non-ancestor.
- The checkout is clean, including staged changes, deletions, untracked files, and dirty submodules. This check runs before the CLI creates its own log. Existing generated files must be ignored or removed before retrying.
- The checkout's HEAD matches the commit Chromatic will test. Check out the feature head explicitly for the pilot; synthetic merge checkouts and mismatched `CHROMATIC_SHA` overrides are unsupported.
- The invocation is a Storybook CI build. `--ci` can identify CI environments that Chromatic does not detect automatically. Patch builds, local addon builds, React Native, and E2E modes are rejected.
- An active `--skip` conflicts with either option, including a matching branch glob and the tokenless skip shortcut. A nonmatching skip glob is allowed.
- Bypass enables `onlyChanged` for the invocation, including when an existing branch glob would exclude the current branch. An effective `onlyChanged: false` is rejected; `--only-changed` can override a false configuration value. Existing story-subset conflicts still apply.

Once these checks pass, `baselineWorkflow` diagnostics record `state: UNSUPPORTED` and `reason: BASELINE_FEATURE_UNSUPPORTED`. This means this CLI has no integrated baseline protocol; it is **not** evidence that the required commit lacks a build. Use `--diagnostics-file` to retain these diagnostics. Neither `--exit-zero-on-changes`, `--exit-once-uploaded`, `--force-rebuild`, `--ignore-last-build-on-branch`, nor `--dry-run` turns that result into success. Invalid options exit 254; a dirty checkout exits 101.

Invocations without either option retain their existing behavior and GraphQL operations. The Git utility now accepts argument arrays; those calls always disable shell interpretation. Existing string callers keep their behavior.

See [the server implementation plan](SERVER-BASELINE-WORKFLOW-PLAN.md) for the proposed contract and remaining CLI work. It separates the current local diagnostics from the future server response types. No READY/BLOCKED fixture is presented as an agreed or implemented API.

After integration and staging verification, the intended CI commands are:

```sh
# Every relevant main commit, checked out exactly.
yarn chromatic --bypass-if-unchanged

# Feature CI supplies its validated branch point, not the latest main build.
yarn chromatic --require-baseline "$CHROMATIC_REQUIRED_BASELINE"
```

Those commands currently stop at the unsupported-protocol guard. Do not enable them in the customer pipeline yet. The future workflow also requires main CI to cover every relevant commit, including intermediate commits in multi-commit pushes, without concurrency cancellation discarding their jobs.

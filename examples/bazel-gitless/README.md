# Bazel Storybook build in a Gitless container

This example keeps the Storybook build container free of both the `git` executable and `.git`
history without changing Chromatic's baseline or TurboSnap behavior.

The boundary is:

```text
CI runner (Git + full history)
  |
  | sends source files, explicitly excluding .git
  v
Gitless Docker build
  -> Bazel target
  -> static Storybook artifact
  |
  | exports only storybook-static/
  v
CI runner
  -> Chromatic CLI --storybook-build-dir=storybook-static --only-changed
```

Chromatic still runs where the full commit graph is available. Bazel and the container are only
responsible for producing the static Storybook. This preserves ancestor-build selection, branch
baselines, merge behavior, and TurboSnap's baseline-relative diffs for every branch your trusted
workflow publishes.

## Files

- `Dockerfile` builds the Storybook without installing Git.
- `Dockerfile.dockerignore` uses a default-deny allowlist, so `.git`, diagnostics, and local
  credentials never enter the BuildKit context or cache.
- `BUILD.bazel` exposes a small `bazel run //:storybook` adapter for this repository.
- `non-tty-stdin-shim.cjs` supports this repository's terminal-frame Storybook plugin in CI.
- `verify-storybook.cjs` validates the metadata and TurboSnap stats in the handoff artifact.
- `github-actions.yml` demonstrates the CI boundary and publishes the exported artifact.

The Dockerfile contains assertions for both sides of the mandate:

```dockerfile
RUN test ! -e .git
RUN ! command -v git
```

## Run the example

Run this from the root of `chromatic-cli` with Docker Buildx available:

```sh
docker buildx build \
  --file examples/bazel-gitless/Dockerfile \
  --target artifact \
  --output type=local,dest=./storybook-static \
  .
```

The exported directory is a normal prebuilt Storybook. With `CHROMATIC_PROJECT_TOKEN` set in the
environment, publish it from the checkout-owning host where Git and the full history are available:

```sh
npx chromatic@18.0.1 \
  --storybook-build-dir=storybook-static \
  --only-changed
```

Copy `github-actions.yml` into `.github/workflows/` to use the complete example. It intentionally
checks out with `fetch-depth: 0` on the runner while the Docker-specific ignore file prevents that
history from crossing into the build container. It also verifies that the checkout is not shallow;
pull requests build and verify the artifact but skip the secret-bearing Chromatic step. The sample
publishes only from `main`. To publish feature branches, route the secret-bearing step through a
protected environment or another trusted workflow rather than exposing the token to branch-owned
workflow code. Manual dispatches against other refs also build and verify without receiving the
token.

## Adapting it to an existing Bazel repository

The `storybook` target here is an integration adapter around this repository's existing Yarn
Storybook build. It is intentionally small so the example stays focused on the security boundary.

In a repository where Storybook is already modeled as a hermetic Bazel target, replace this line in
the Dockerfile:

```dockerfile
RUN bazel run //:storybook -- /out
```

with the customer's real build and copy its declared output to `/out`, for example:

```dockerfile
RUN bazel build //ui/storybook:static
RUN cp -R bazel-bin/ui/storybook/static/. /out/
```

Keep the remainder of the workflow unchanged: exclude `.git`, assert that Git is absent, export the
prebuilt Storybook, and invoke Chromatic outside the container. The real Bazel target must build
Storybook with `--stats-json` and include `preview-stats.json` in its output for `--only-changed` to
perform TurboSnap dependency tracing. Source modules in that file must use repository-relative paths,
not absolute container paths such as `/workspace/ui/Button.stories.tsx`; otherwise the host-side CLI
cannot match them to changed files in its checkout. The included verifier rejects non-virtual absolute
module paths.

For a production workflow, pin the container image by digest, pin GitHub Actions to full commit
SHAs, and run a lockfile-installed Chromatic CLI instead of the self-contained `npx` command shown
here.

## What this does not solve

This is not a fully Gitless Chromatic CLI. Git still exists on the CI runner because the current CLI
uses it for baseline and TurboSnap correctness. If policy also prohibits Git on that runner, the CLI
would need the proposed VCS-manifest/provider work; environment variables alone are not sufficient.

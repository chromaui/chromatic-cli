#!/usr/bin/env bash
# gen.sh <package> <output-file> [stats-file]
# Generates a TurboSnap v2 manifest for one package in the fixture monorepo.
#
# Pass <stats-file> to read the module graph from somewhere other than the package's own
# storybook-static/preview-stats.json — e.g. a snapshot, so a concurrent Storybook rebuild can't
# change the graph underneath a running comparison. Source files are still hashed off disk under the
# package, so the snapshot must have been taken from this same package.
#
# Env overrides:
#   CHROMATIC_CLI  path to the built CLI entry (default: <this repo>/dist/bin.cjs)
#   MONOREPO       path to the fixture repo    (default: ~/Projects/turbosnap-monorepo)
#
# Requires a built CLI (run `yarn build` in chromatic-cli first) and a package with a prebuilt
# storybook-static/preview-stats.json.
set -euo pipefail

PKG="${1:?usage: gen.sh <package> <output-file> [stats-file]}"
OUT="${2:?usage: gen.sh <package> <output-file> [stats-file]}"
STATS_FILE="${3:-}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="${CHROMATIC_CLI:-$HERE/../../dist/bin.cjs}"
MONOREPO="${MONOREPO:-$HOME/Projects/turbosnap-monorepo}"

if [[ ! -f "$CLI" ]]; then
  echo "CLI not found at $CLI — run \`yarn build\` in chromatic-cli, or set CHROMATIC_CLI." >&2
  exit 1
fi

# The subcommand resolves --storybook-base-dir relative to the git repo root, so run from the repo.
cd "$MONOREPO"
if [[ -n "$STATS_FILE" ]]; then
  node "$CLI" turbosnap-manifest -b "packages/$PKG" -s "$STATS_FILE" > "$OUT"
else
  node "$CLI" turbosnap-manifest -b "packages/$PKG" > "$OUT"
fi


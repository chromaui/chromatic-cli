#!/usr/bin/env bash
# parity.sh <package>   e.g. parity.sh ui | ui-webpack | ui-rsbuild
# Runs the v1-vs-v2 recapture comparison across the edit matrix for one builder package.
#
# For each edit it collects both sides for the SAME change:
#   v1  `chromatic trace --json` on the unchanged stats file (a source path, or `-d <pkg>` for a bump)
#   v2  two `chromatic turbosnap-manifest` runs, before and after the edit
# then hands both to parity.mjs for the verdict. See parity.mjs for how the verdicts are defined.
#
# Source edits are content-only (append a comment) and reverted with `git checkout`; node_modules
# edits are backed up and restored, since git ignores them.
#
# Env overrides: CHROMATIC_CLI, MONOREPO (see gen.sh).
set -uo pipefail

PKG="${1:?usage: parity.sh <package>   (ui | ui-webpack | ui-rsbuild)}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="${CHROMATIC_CLI:-$HERE/../../dist/bin.cjs}"
MONOREPO="${MONOREPO:-$HOME/Projects/turbosnap-monorepo}"
STATS="packages/$PKG/storybook-static/preview-stats.json"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ ! -f "$CLI" ]]; then
  echo "CLI not found at $CLI — run \`yarn build\` in chromatic-cli, or set CHROMATIC_CLI." >&2
  exit 1
fi
if [[ ! -f "$MONOREPO/$STATS" ]]; then
  echo "Stats file not found at $MONOREPO/$STATS — run \`yarn build-storybook:all\` in the fixture." >&2
  exit 1
fi

# Snapshot the stats file for the whole run. The fixture is shared, so a Storybook rebuild in another
# session would otherwise swap the module graph halfway through and invalidate every later result.
SNAPSHOT="$WORK/preview-stats.json"
cp "$MONOREPO/$STATS" "$SNAPSHOT"

# The graph is an input to every result below, and the fixture's Storybook gets rebuilt from time to
# time. Stamp which graph this run measured, so results can be attributed to it rather than compared
# blind against an earlier run of a different build.
echo "stats snapshot: $STATS"
echo "  size: $(wc -c < "$SNAPSHOT" | tr -d ' ') bytes  sha: $(shasum -a 256 "$SNAPSHOT" | cut -c1-12)  mtime: $(date -r "$MONOREPO/$STATS" '+%Y-%m-%d %H:%M:%S')"

FAILURES=0

gen() { bash "$HERE/gen.sh" "$PKG" "$1" "$SNAPSHOT"; }

# v1 <output-file> <trace-args...>
v1() {
  local out="$1"
  shift
  (cd "$MONOREPO" && node "$CLI" trace -b "packages/$PKG" -s "$SNAPSHOT" --json "$@") > "$out"
}

# Empty or unparseable inputs mean the run itself broke (a missing stats file, a crashed CLI). That
# is not a parity result, so stop rather than reporting a verdict derived from nothing.
require_json() {
  if [[ ! -s "$1" ]] || ! node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$1" 2>/dev/null; then
    echo "  ABORT — $2 produced no usable JSON ($1). The run is invalid." >&2
    exit 2
  fi
}

compare() {
  local name="$1" changed="${2:-}"
  echo "========================================================"
  echo "TEST: $name   [$PKG]"
  [[ -n "$changed" ]] && echo "  changed: $changed"
  require_json "$WORK/base.json" "v2 baseline manifest"
  require_json "$WORK/cur.json" "v2 post-edit manifest"
  require_json "$WORK/v1.json" "v1 trace"
  node "$HERE/parity.mjs" "$WORK/base.json" "$WORK/cur.json" "$WORK/v1.json" "packages/$PKG" | sed 's/^/  /'
  local status="${PIPESTATUS[0]}"
  if [[ "$status" == "1" ]]; then
    FAILURES=$((FAILURES + 1))
  elif [[ "$status" != "0" ]]; then
    echo "  ABORT — parity.mjs failed (exit $status)." >&2
    exit 2
  fi
}

gen "$WORK/base.json"

# run_src <name> <repo-relative-file>
# A changed source file: v1 traces the path, v2 diffs manifests across the edit.
run_src() {
  local name="$1" file="$2"
  printf '\n// tsparity %s\n' "$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')" >> "$MONOREPO/$file"
  gen "$WORK/cur.json"
  git -C "$MONOREPO" checkout -- "$file"
  v1 "$WORK/v1.json" "$file"
  compare "$name" "$file"
}

# run_dep <name> <package-name>
# A dependency upgrade: v1 gets the package name as a lockfile diff would report it, v2 sees an edited
# file on disk. The file is chosen from this builder's own graph (see depfile.mjs) so both sides are
# shown the same change. Restored from a backup because git does not track node_modules.
run_dep() {
  local name="$1" package="$2"
  local file
  if ! file="$(node "$HERE/depfile.mjs" "$WORK/base.json" "$package" 2>/dev/null)"; then
    echo "========================================================"
    echo "TEST: $name   [$PKG]"
    echo "  SKIPPED — no files for \"$package\" in this builder's graph, so v2 cannot see the bump."
    return
  fi
  # depfile.mjs prints a *manifest* key, which is project-relative (a hoisted dependency reads as
  # `../../node_modules/...`), so it resolves against the package directory — unlike the repo-relative
  # paths run_src is given.
  local abs="$MONOREPO/packages/$PKG/$file"
  cp "$abs" "$WORK/nm-backup"
  printf '\n// tsparity dependency edit\n' >> "$abs"
  gen "$WORK/cur.json"
  cp "$WORK/nm-backup" "$abs"
  v1 "$WORK/v1.json" -d "$package"
  compare "$name" "$file"
}

run_src "Edit leaf component Badge.tsx"     "packages/$PKG/src/lib/Badge/Badge.tsx"
run_src "Edit UserCard.tsx"                  "packages/$PKG/src/lib/UserCard/UserCard.tsx"
run_src "Edit Button.tsx"                    "packages/$PKG/src/lib/Button/Button.tsx"
run_src "Edit story file Badge.stories.tsx"  "packages/$PKG/src/lib/Badge/Badge.stories.tsx"
run_src "Edit cross-pkg shared/src/index.ts" "packages/shared/src/index.ts"
run_src "Edit .storybook/preview.ts"         "packages/$PKG/.storybook/preview.ts"
run_dep "Bump moment (ESM, real edge)"       "moment"
run_dep "Bump react (CJS/prebundled)"        "react"

echo "========================================================"
if [[ "$PKG" == "ui-rsbuild" ]]; then
  # Agreed design 3: rspack is best-effort and never gates.
  echo "RESULT [$PKG]: $FAILURES regression(s) — INFORMATIONAL ONLY (rspack does not gate)"
  exit 0
fi
echo "RESULT [$PKG]: $FAILURES regression(s)"
exit $((FAILURES > 0 ? 1 : 0))


#!/usr/bin/env bash
# Runs a packed CLI (the tarball `yarn pack` writes) against one e2e fixture the way a user's CI
# would, and fails on the first result that isn't what that CLI should produce:
#
#   1. An invalid project token exits 202 with the invalid token message.
#   2. A first build on a fresh branch captures every story.
#   3. A commit to a file only Button's story depends on (`src/Button.tsx`, or `packages/shared`
#      in a monorepo), built with --only-changed and TurboSnap 2.0, captures one snapshot and
#      copies the other.
#   4. Another such commit, built with TurboSnap 1.0, does the same and traces it to Button only.
#   5. `trace` and `turbosnap-manifest` read the last build's stats offline.
#
# The builds publish to the project CHROMATIC_PROJECT_TOKEN names. CI uses the smoke-test project.
#
# Usage: e2e/checkPackedCli.sh <fixture> <path to chromatic.tgz> [work directory]
set -euo pipefail

usage='usage: e2e/checkPackedCli.sh <fixture> <chromatic.tgz> [work directory]'
fixture=${1:?$usage}
tgz=$(realpath "${2:?$usage}")
work=${3:-$(mktemp -d)}
: "${CHROMATIC_PROJECT_TOKEN:?set CHROMATIC_PROJECT_TOKEN to the project the builds publish to}"

repo=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$work/out"
work=$(realpath "$work")
project="$work/$fixture"
out="$work/out"

fail() {
  echo "::error title=$fixture::$*"
  exit 1
}

commit() {
  git -C "$project" add --all
  git -C "$project" -c user.name=Fixture -c user.email=fixture@example.com \
    -c commit.gpgsign=false -c core.hooksPath=/dev/null commit --quiet -m "$1"
}

# Copies the fixture out of this repository, commits it, and installs its lockfile.
node "$repo/e2e/prepare.mjs" "$fixture" "$project"

# The fixture's own package manager installs the tarball into the Storybook package and runs it.
case "$fixture" in
  monorepo-npm)
    install=(npm install --save-dev --workspace packages/ui "$tgz")
    cli=(npx --no-install chromatic)
    ;;
  monorepo-pnpm)
    pnpm=(npx --yes "pnpm@$(jq -r '.packageManager | ltrimstr("pnpm@") | split("+")[0]' "$project/package.json")")
    install=("${pnpm[@]}" --filter @myorg/ui add --save-dev "$tgz")
    cli=("${pnpm[@]}" exec chromatic)
    ;;
  monorepo-yarn | monorepo-yarn-pnp)
    install=(corepack yarn workspace @myorg/ui add --dev "chromatic@file:$tgz")
    cli=(corepack yarn chromatic)
    ;;
  monorepo-yarn-classic)
    install=(corepack yarn workspace @myorg/ui add --dev "file:$tgz")
    # --silent keeps Yarn 1's banner out of turbosnap-manifest's JSON on stdout
    cli=(corepack yarn --silent chromatic)
    ;;
  react-vite | react-webpack5 | react-rsbuild | react-vitest)
    install=(npm install --save-dev "$tgz")
    cli=(npx --no-install chromatic)
    ;;
  *) fail "no install command for $fixture; add one to e2e/checkPackedCli.sh" ;;
esac

# Each change reaches Button's story and no other. Its path is relative to the git root, as users
# pass changed files to `trace`.
if [[ -d $project/packages/ui ]]; then
  storybook=packages/ui change=packages/shared/src/index.ts
else
  storybook=. change=src/Button.tsx
fi
if [[ $fixture == react-vitest ]]; then
  build_args=(--vitest) manifest=(turbosnap-manifest --vitest)
else
  build_args=(--build-script-name build-storybook) manifest=(turbosnap-manifest)
fi

(cd "$project" && YARN_ENABLE_IMMUTABLE_INSTALLS=false "${install[@]}")
commit 'Install the packed CLI'
# Builds on the same branch are each other's baselines, so every run starts its own.
git -C "$project" switch --quiet --create \
  "e2e-$fixture-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-$(date +%s)}"

cd "$project/$storybook"
if [[ $fixture == react-vitest ]]; then
  npx playwright install ${GITHUB_ACTIONS:+--with-deps} chromium
fi

# @chromatic-com/vitest numbers each archive's story file in the order archives are written, and
# TurboSnap 2.0 keys stories by that file. Running one test file at a time, with no cached durations
# to reorder them, keeps the keys stable across builds.
write_archives() {
  if [[ $fixture == react-vitest ]]; then
    rm -rf .vitest
    npm test -- --no-file-parallelism --no-cache
  fi
}

# run_cli <label> <expected exit code> <args...>
run_cli() {
  local label=$1 expected=$2 code=0
  shift 2
  echo "▶ $label: chromatic $*"
  "${cli[@]}" "$@" 2>&1 | tee "$out/$label.log" || code=$?
  [[ $code == "$expected" ]] || fail "$label exited $code, expected $expected"
}

expect_output() {
  grep -qF -- "$2" "$out/$1.log" || fail "$1 printed no line containing: $2"
}

expect_diagnostics() {
  jq -e "$2" "$out/$1.json" > /dev/null || fail "$1 diagnostics fail: $2"
}

build() {
  local label=$1
  run_cli "$label" 0 "${build_args[@]}" --only-changed --exit-zero-on-changes \
    --output-dir "$out/$label-storybook" --diagnostics-file "$out/$label.json"
}

change_button() {
  echo "// $1" >> "$project/$change"
  commit "$1"
  write_archives
}

CHROMATIC_PROJECT_TOKEN=not-a-real-token run_cli invalid-token 202 "${build_args[@]}"
expect_output invalid-token "Invalid --project-token 'not-a-real-token'"

write_archives
build baseline
expect_diagnostics baseline '.build.actualCaptureCount == 2'

# The baseline uploaded hashes, so TurboSnap 2.0 can compare against it.
change_button 'Change Button for TurboSnap 2.0'
CHROMATIC_TURBOSNAP_DISABLE_V1=true build turbosnap-2
expect_output turbosnap-2 'TurboSnap 2.0 enabled'
expect_output turbosnap-2 'Capturing 1 snapshot; copying 1 snapshot with TurboSnap.'
expect_diagnostics turbosnap-2 '.turboSnapOutcome.mechanism == "v2" and .turboSnapOutcome.bailed == false'

change_button 'Change Button for TurboSnap 1.0'
CHROMATIC_TURBOSNAP_DISABLE_HASHES=true build turbosnap-1
expect_output turbosnap-1 'TurboSnap enabled'
expect_output turbosnap-1 'Capturing 1 snapshot; copying 1 snapshot with TurboSnap.'
expect_diagnostics turbosnap-1 \
  '.turboSnapOutcome.mechanism == "v1" and .turboSnapOutcome.bailed == false and
   (.onlyStoryFiles | length > 0 and all(test("button"; "i")))'

storybook_static="$out/turbosnap-1-storybook"
run_cli trace 0 trace -m compact -b "$storybook" -s "$storybook_static/preview-stats.json" "$change"
grep -qiE 'button[^/ ]*\.stories' "$out/trace.log" || fail "trace listed no story file for Button"
! grep -qi badge "$out/trace.log" || fail "trace listed Badge, which the change doesn't reach"

"${cli[@]}" "${manifest[@]}" -s "$storybook_static/preview-stats.json" \
  > "$out/turbosnap-manifest.json" || fail "turbosnap-manifest exited $?"
jq -e --slurpfile index "$storybook_static/index.json" \
  '($index[0].entries | length) > 0 and ([$index[0].entries[].importPath] - (.storyFiles | keys)) == []' \
  "$out/turbosnap-manifest.json" > /dev/null ||
  fail "turbosnap-manifest is missing story files: $(jq -c '.storyFiles | keys' "$out/turbosnap-manifest.json")"

echo "✅ $fixture: every check passed"

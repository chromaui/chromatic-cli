#!/usr/bin/env bash
# structural-probe.sh <package> [case ...]
#
# Probes TurboSnap v2 attribution when the *shape* of the module graph changes, not just the bytes of
# files already in it. Every other probe in this harness edits content against a fixed
# `preview-stats.json` snapshot on purpose; this one **rebuilds the fixture's Storybook** for each
# case so the stats regenerate, which is the only way a new import, a new story file or a moved
# module can be observed at all.
#
# Cases (run all by default, or name them as arguments):
#
#   new-import        a new first-party module imported by an existing story component
#   new-story         a new *.stories.tsx added under the stories glob
#   delete-story      an existing story file removed
#   move-module       src/theme.ts -> src/theme/index.ts, bytes intact, no importer edits
#                     (directory-index resolution keeps `../../theme` byte-identical)
#   move-path-derived the same byte-preserving move, but of a component whose *path reaches the
#                     emitted output*: a CSS Module class name and a `new URL(..., import.meta.url)`
#                     asset. This is the case that decides whether "identical bytes render
#                     identically" survives, so read its emitted-output diff, not just its hashes.
#   move-component    Badge.tsx -> Badge/index.tsx, bytes intact, story-side importers only
#   move-package      Badge.tsx moved from packages/<pkg> into packages/shared, importers updated
#   move-story        a story file renamed with its bytes intact and its explicit `title` unchanged
#   move-story-autotitle
#                     an autotitled story file moved to another directory, so its story IDs change
#                     while its bytes do not
#   new-dep           first import of an installed-but-unused dependency (nanoid)
#   remove-import     Button.tsx stops importing src/theme.ts, which preview.ts still imports
#   remove-dep        Button.tsx stops importing moment, dropping it out of the graph entirely
#   orphan-to-bucket  a module imported by both a story and a main.ts `previewAnnotations` module
#                     loses its story importer, so it can only be reached from a bucket resident
#
# Every case restores the fixture with a trap and rebuilds Storybook at the end, so the package's
# `preview-stats.json` is left matching the committed source.
#
# Env overrides:
#   CHROMATIC_CLI  path to the built CLI entry (default: <this repo>/dist/bin.cjs)
#   MONOREPO       path to the fixture repo    (default: ~/Projects/turbosnap-monorepo)
#   FORCE_DIRTY=1  run even though the fixture working tree is dirty (see the warning below)
#
# WARNING: restoring a case uses `git checkout` + `git clean`, which discards *uncommitted* fixture
# changes. Commit your fixture edits in the monorepo before running this.
set -euo pipefail

PKG="${1:?usage: structural-probe.sh <package> [case ...]}"
shift || true

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="${CHROMATIC_CLI:-$HERE/../../dist/bin.cjs}"
MONOREPO="${MONOREPO:-$HOME/Projects/turbosnap-monorepo}"
WORK="$(mktemp -d)"

ALL_CASES=(
  new-import
  new-story
  delete-story
  move-module
  move-component
  move-path-derived
  move-package
  move-story
  move-story-autotitle
  new-dep
  remove-import
  remove-dep
  orphan-to-bucket
)
CASES=("$@")
if [[ ${#CASES[@]} -eq 0 ]]; then CASES=("${ALL_CASES[@]}"); fi

PKG_DIR="packages/$PKG"
SRC="$PKG_DIR/src"
STATS="$PKG_DIR/storybook-static/preview-stats.json"
# Both packages this probe supports are restored wholesale, so every edit must land inside one of
# these two trees.
OWNED_TREES=("$PKG_DIR" "packages/shared")

if [[ "$PKG" == "marketing-ui" ]]; then
  echo "Refusing to run on marketing-ui: its preview-stats.json predates the patched builder-vite" >&2
  echo "fork and is the live unpatched-vite control. Rebuilding it destroys that control." >&2
  exit 2
fi
if [[ ! -f "$CLI" ]]; then
  echo "CLI not found at $CLI - run \`yarn build\` in chromatic-cli, or set CHROMATIC_CLI." >&2
  exit 1
fi
if [[ ! -d "$MONOREPO/$SRC/lib/Button" ]]; then
  echo "Fixture package not found at $MONOREPO/$SRC." >&2
  exit 1
fi

restore_tree() {
  set +e
  git -C "$MONOREPO" checkout -- "${OWNED_TREES[@]}" >/dev/null 2>&1
  # -d but not -x: storybook-static is gitignored and must survive, untracked probe files must not.
  git -C "$MONOREPO" clean -fdq "${OWNED_TREES[@]}" >/dev/null 2>&1
  set -e
}

RESTORED=0
cleanup() {
  set +e
  if [[ "$RESTORED" != "1" ]]; then
    restore_tree
    echo
    echo "== restoring $STATS to the committed source =="
    (cd "$MONOREPO" && NODE_ENV=production NX_SKIP_NX_CACHE=1 \
      yarn nx run "$PKG:build-storybook" >/dev/null 2>&1)
    RESTORED=1
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

if [[ -n "$(git -C "$MONOREPO" status --porcelain -- "${OWNED_TREES[@]}")" && "${FORCE_DIRTY:-}" != "1" ]]; then
  echo "Fixture working tree is dirty under ${OWNED_TREES[*]}:" >&2
  git -C "$MONOREPO" status --porcelain -- "${OWNED_TREES[@]}" >&2
  echo "This probe restores with \`git checkout\`, which would discard those changes. Commit them" >&2
  echo "first, or set FORCE_DIRTY=1 to lose them deliberately." >&2
  exit 2
fi

build() {
  (cd "$MONOREPO" && NODE_ENV=production NX_SKIP_NX_CACHE=1 \
    yarn nx run "$PKG:build-storybook" >/dev/null 2>&1) || {
    echo "  BUILD FAILED - see \`yarn nx run $PKG:build-storybook\`" >&2
    return 1
  }
}
restore_after_failed_build() {
  restore_tree
  if ! build; then
    echo "  ABORT — clean fixture no longer builds after restoring a failed case" >&2
    exit 2
  fi
}
gen() { bash "$HERE/gen.sh" "$PKG" "$1"; }
stats_sha() { shasum -a 256 "$MONOREPO/$STATS" | cut -c1-12; }

# Every file a browser would actually fetch, hashed. Sourcemaps carry source paths and so change on
# any move without affecting a render; the stats file and the index are measured on their own; the
# manager bundle is never captured by Chromatic. Excluding those four leaves the render's own bytes.
out_manifest() {
  (
    cd "$MONOREPO/$PKG_DIR/storybook-static"
    find . -type f \
      ! -name '*.map' ! -name 'preview-stats.json' ! -name 'index.json' \
      ! -path './sb-manager/*' -exec shasum -a 256 {} + | sed 's#\./##' | sort -k2
  ) > "$1"
}

# v1's verdict for the same change, so a v2 "recaptures nothing" can be read against it.
v1_trace() {
  (cd "$MONOREPO" && node "$CLI" trace -b "$PKG_DIR" -s "$STATS" --json "$@")
}

# The story IDs Storybook actually indexed. A hash verdict only means something next to these: an
# autotitled story file changes every ID it holds without changing a byte.
story_ids() {
  node -e "
    const index = require('$MONOREPO/$PKG_DIR/storybook-static/index.json');
    require('fs').writeFileSync(process.argv[1], Object.keys(index.entries).sort().join('\n') + '\n');
  " "$1"
}

# Applies an exact string replacement to a fixture file, failing loudly if the anchor is missing, so
# a fixture edit can never silently turn a case into a no-op.
patch_file() {
  node - "$MONOREPO/$1" "$2" "$3" <<'NODE'
const fs = require('fs');
const [file, find, replace] = process.argv.slice(2);
const source = fs.readFileSync(file, 'utf8');
if (!source.includes(find)) {
  console.error(`patch anchor not found in ${file}: ${JSON.stringify(find)}`);
  process.exit(1);
}
fs.writeFileSync(file, source.replace(find, replace));
NODE
}

# ---------------------------------------------------------------------------------------------
# Cases. Each `apply_<case>` mutates the fixture; an optional `setup_<case>` establishes a non-clean
# baseline that the case's own edit is then measured against.
# ---------------------------------------------------------------------------------------------

apply_new-import() {
  cat > "$MONOREPO/$SRC/lib/Button/spacing.ts" <<'TS'
export const buttonPadding = '8px 16px';
TS
  patch_file "$SRC/lib/Button/Button.tsx" \
    "import { accentColor } from '../../theme';" \
    "import { accentColor } from '../../theme';
import { buttonPadding } from './spacing';"
  patch_file "$SRC/lib/Button/Button.tsx" "padding: '8px 16px'" "padding: buttonPadding"
}

apply_new-story() {
  cat > "$MONOREPO/$SRC/lib/Badge/BadgeExtra.stories.tsx" <<'TSX'
import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'UI/BadgeExtra',
  component: Badge,
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Extra: Story = { args: { text: 'Extra' } };
TSX
}

apply_delete-story() {
  rm "$MONOREPO/$SRC/lib/Badge/Badge.stories.tsx"
}

apply_move-module() {
  mkdir -p "$MONOREPO/$SRC/theme"
  mv "$MONOREPO/$SRC/theme.ts" "$MONOREPO/$SRC/theme/index.ts"
}

# move-module's mover is also imported by `.storybook/preview.ts`, which makes v1 bail rather than
# trace, hiding whether v2 is narrower than a *tracing* v1. Badge.tsx has only story-side importers,
# so this isolates that. `./Badge` and `../Badge/Badge` both resolve to the directory index, so again
# no importer byte changes.
apply_move-component() {
  mkdir -p "$MONOREPO/$SRC/lib/Badge/Badge"
  mv "$MONOREPO/$SRC/lib/Badge/Badge.tsx" "$MONOREPO/$SRC/lib/Badge/Badge/index.tsx"
}

# The one case where "identical bytes render identically" can actually fail. `PathDerived` imports a
# CSS Module (whose class names a bundler may hash from the stylesheet's path) and resolves an asset
# with `new URL('./logo.svg', import.meta.url)`. Moving the component to a directory index takes both
# along, so no importer byte changes and the story file stays put — only paths move. The verdict here
# is the emitted-output diff, not the hashes: hashes only say what v2 recaptures, and the question is
# whether there was anything to recapture.
apply_move-path-derived() {
  mkdir -p "$MONOREPO/$SRC/lib/PathDerived/PathDerived"
  mv "$MONOREPO/$SRC/lib/PathDerived/PathDerived.tsx" \
    "$MONOREPO/$SRC/lib/PathDerived/PathDerived/index.tsx"
  mv "$MONOREPO/$SRC/lib/PathDerived/styles.module.css" \
    "$MONOREPO/$SRC/lib/PathDerived/PathDerived/styles.module.css"
  mv "$MONOREPO/$SRC/lib/PathDerived/logo.svg" \
    "$MONOREPO/$SRC/lib/PathDerived/PathDerived/logo.svg"
}

# v1 works from changed *paths*, so a move is two changes: the old path gone and the new one added.
v1_paths_move-path-derived() {
  echo "$SRC/lib/PathDerived/PathDerived.tsx"
  echo "$SRC/lib/PathDerived/PathDerived/index.tsx"
}

v1_paths_move-component() {
  echo "$SRC/lib/Badge/Badge.tsx"
  echo "$SRC/lib/Badge/Badge/index.tsx"
}

apply_move-package() {
  mv "$MONOREPO/$SRC/lib/Badge/Badge.tsx" "$MONOREPO/packages/shared/src/Badge.tsx"
  patch_file "$SRC/lib/Badge/Badge.stories.tsx" \
    "from './Badge'" "from '../../../../shared/src/Badge'"
  patch_file "$SRC/lib/UserCard/UserCard.tsx" \
    "from '../Badge/Badge'" "from '../../../../shared/src/Badge'"
}

apply_move-story() {
  mv "$MONOREPO/$SRC/lib/Badge/Badge.stories.tsx" "$MONOREPO/$SRC/lib/Badge/BadgeRenamed.stories.tsx"
}

# An autotitled story derives its title (and so its story IDs) from its path, so moving it renames
# every story in it without changing a byte. The gate deliberately excludes story file paths
# (manifest.ts, "Story file paths deliberately stay out of the gate"), so this is where that
# decision is observable end to end — compare the story IDs printed for each side.
setup_move-story-autotitle() {
  cat > "$MONOREPO/$SRC/lib/Badge/AutoTitle.stories.tsx" <<'TSX'
import type { Meta, StoryObj } from '@storybook/react';
// Imported by a path that resolves identically from both directories, so the move changes no bytes.
import { Badge } from '../Badge/Badge';

const meta: Meta<typeof Badge> = { component: Badge };
export default meta;
type Story = StoryObj<typeof Badge>;

export const Auto: Story = { args: { text: 'Auto' } };
TSX
}

apply_move-story-autotitle() {
  mkdir -p "$MONOREPO/$SRC/lib/Renamed"
  mv "$MONOREPO/$SRC/lib/Badge/AutoTitle.stories.tsx" \
    "$MONOREPO/$SRC/lib/Renamed/AutoTitle.stories.tsx"
}

apply_new-dep() {
  patch_file "$SRC/lib/Button/Button.tsx" \
    "import moment from 'moment';" \
    "import moment from 'moment';
import { nanoid } from 'nanoid';"
  patch_file "$SRC/lib/Button/Button.tsx" "<div>" "<div id={nanoid()}>"
}

apply_remove-import() {
  patch_file "$SRC/lib/Button/Button.tsx" "import { accentColor } from '../../theme';
" ""
  patch_file "$SRC/lib/Button/Button.tsx" "backgroundColor: accentColor" "backgroundColor: '#0070f3'"
}

apply_remove-dep() {
  patch_file "$SRC/lib/Button/Button.tsx" "import moment from 'moment';
" ""
  patch_file "$SRC/lib/Button/Button.tsx" "<p>{moment().format()}" "<p>{'static'}"
}

# The one way to reach the `<storybookGlobals>` catch-all structurally: a module reachable from a
# bucket resident but no longer from any story. main.ts `previewAnnotations` is the supported,
# real-world mechanism for a preview-side global that is neither a story nor `.storybook/preview.*`.
setup_orphan-to-bucket() {
  cat > "$MONOREPO/$SRC/globalToken.ts" <<'TS'
export const globalToken = '#0070f3';
TS
  cat > "$MONOREPO/$PKG_DIR/.storybook/previewAnnotation.ts" <<'TS'
import { globalToken } from '../src/globalToken';

export const parameters = { globalToken };
TS
  patch_file "$PKG_DIR/.storybook/main.ts" \
    "  addons: [" \
    "  previewAnnotations: [new URL('./previewAnnotation.ts', import.meta.url).pathname],
  addons: ["
  patch_file "$SRC/lib/Button/Button.tsx" \
    "import { accentColor } from '../../theme';" \
    "import { accentColor } from '../../theme';
import { globalToken } from '../../globalToken';"
  patch_file "$SRC/lib/Button/Button.tsx" \
    "danger: { backgroundColor: '#e00'" "danger: { backgroundColor: globalToken"
}

apply_orphan-to-bucket() {
  patch_file "$SRC/lib/Button/Button.tsx" "import { globalToken } from '../../globalToken';
" ""
  patch_file "$SRC/lib/Button/Button.tsx" \
    "danger: { backgroundColor: globalToken" "danger: { backgroundColor: '#e00'"
}

# ---------------------------------------------------------------------------------------------

echo "package: $PKG   CLI: $CLI"
if [[ -f "$MONOREPO/node_modules/@storybook/builder-vite/dist/index.js" ]]; then
  if grep -q "commonjs-es-import" "$MONOREPO/node_modules/@storybook/builder-vite/dist/index.js" &&
    ! grep -q 'moduleName !== "react/jsx-runtime"' "$MONOREPO/node_modules/@storybook/builder-vite/dist/index.js"; then
    echo "installed @storybook/builder-vite: PATCHED (fork build)"
  else
    echo "installed @storybook/builder-vite: unpatched"
  fi
fi

restore_tree
echo
echo "== clean baseline =="
build
echo "stats sha: $(stats_sha)"
gen "$WORK/clean-base.json"
story_ids "$WORK/clean-base.ids"
out_manifest "$WORK/clean-base.out"
node "$HERE/bucket.mjs" "$WORK/clean-base.json" | head -5

FAILURES=0

for CASE in "${CASES[@]}"; do
  if ! declare -F "apply_$CASE" >/dev/null; then
    echo "unknown case: $CASE (known: ${ALL_CASES[*]})" >&2
    exit 2
  fi

  echo
  echo "================ $CASE ================"
  restore_tree

  BASE="$WORK/clean-base.json"
  BASE_IDS="$WORK/clean-base.ids"
  BASE_OUT="$WORK/clean-base.out"
  if declare -F "setup_$CASE" >/dev/null; then
    echo "-- setup (case-specific baseline) --"
    if ! (set -e; "setup_$CASE"); then
      echo "  FAIL — setup failed" >&2
      FAILURES=$((FAILURES + 1))
      restore_tree
      continue
    fi
    if ! build; then
      FAILURES=$((FAILURES + 1))
      restore_after_failed_build
      continue
    fi
    BASE="$WORK/$CASE-base.json"
    BASE_IDS="$WORK/$CASE-base.ids"
    BASE_OUT="$WORK/$CASE-base.out"
    gen "$BASE"
    story_ids "$BASE_IDS"
    out_manifest "$BASE_OUT"
    echo "baseline stats sha: $(stats_sha)"
  fi

  BASE_SHA="$(stats_sha)"
  if ! (set -e; "apply_$CASE"); then
    echo "  FAIL — fixture mutation failed" >&2
    FAILURES=$((FAILURES + 1))
    restore_tree
    continue
  fi
  if ! build; then
    FAILURES=$((FAILURES + 1))
    restore_after_failed_build
    continue
  fi
  CUR_SHA="$(stats_sha)"
  gen "$WORK/$CASE-cur.json"
  story_ids "$WORK/$CASE-cur.ids"
  out_manifest "$WORK/$CASE-cur.out"
  echo "stats sha: $BASE_SHA -> $CUR_SHA $([[ "$BASE_SHA" == "$CUR_SHA" ]] && echo '(UNCHANGED - the rebuild saw no graph change)' || echo '(regenerated)')"

  echo "-- tsdiff (what recaptures) --"
  node "$HERE/tsdiff.mjs" "$BASE" "$WORK/$CASE-cur.json" | sed 's/^/  /'
  echo "-- attrdiff (how the graph changed shape) --"
  node "$HERE/attrdiff.mjs" "$BASE" "$WORK/$CASE-cur.json" | sed 's/^/  /'
  echo "-- story IDs Storybook indexed --"
  if diff "$BASE_IDS" "$WORK/$CASE-cur.ids" >/dev/null; then
    echo "  unchanged ($(wc -l < "$BASE_IDS" | tr -d ' ') stories)"
  else
    # `diff` exits non-zero precisely when it found the difference we are asking for, and pipefail
    # would turn that into a fatal error.
    { diff "$BASE_IDS" "$WORK/$CASE-cur.ids" || true; } | grep -E '^[<>]' | sed 's/^/  /'
  fi
  echo "-- emitted output (what a browser would fetch) --"
  node "$HERE/outdiff.mjs" "$BASE_OUT" "$WORK/$CASE-cur.out" | sed 's/^/  /'
  if declare -F "v1_paths_$CASE" >/dev/null; then
    echo "-- v1 on the same change --"
    # shellcheck disable=SC2046  # each line is one path argument, so word splitting is the point.
    v1_trace $("v1_paths_$CASE") | sed 's/^/  /'
  fi

  echo "-- gate --"
  if ! node "$HERE/structural-verdict.mjs" \
    "$CASE" "$BASE" "$WORK/$CASE-cur.json" "$BASE_IDS" "$WORK/$CASE-cur.ids"; then
    FAILURES=$((FAILURES + 1))
  fi

  restore_tree
done

echo
cleanup
trap - EXIT
if [[ "$FAILURES" -gt 0 ]]; then
  echo "RESULT [$PKG]: $FAILURES structural failure(s)"
  exit 1
fi
echo "RESULT [$PKG]: all ${#CASES[@]} structural cases passed"

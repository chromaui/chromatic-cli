#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: bazel run //:storybook -- <output-directory>" >&2
  exit 2
fi

workspace_directory="${BUILD_WORKSPACE_DIRECTORY:?This script must be run with 'bazel run'}"
project_root="$(cd "${workspace_directory}/../.." && pwd)"
output_directory="$1"

if [[ "${REQUIRE_GITLESS:-0}" == "1" ]]; then
  if command -v git >/dev/null 2>&1; then
    echo "The Storybook build container unexpectedly contains a git executable." >&2
    exit 1
  fi

  if [[ -e "${project_root}/.git" ]]; then
    echo "The Storybook build container unexpectedly contains Git history." >&2
    exit 1
  fi
fi

mkdir -p "${output_directory}"
cd "${project_root}"

# This repository's Storybook renders terminal UI frames during its Vite build. Bazel and Docker
# builds have non-TTY stdin, so make the optional ReadStream.unref operation a no-op there.
export NODE_OPTIONS="--require=${workspace_directory}/non-tty-stdin-shim.cjs${NODE_OPTIONS:+ ${NODE_OPTIONS}}"

yarn build-storybook --output-dir "${output_directory}"

node "${workspace_directory}/verify-storybook.cjs" "${output_directory}"

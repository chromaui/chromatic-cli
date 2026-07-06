# Smoke Tests

A self-contained Storybook used by the smoke-test CI workflows to verify the Chromatic CLI works across package managers, Node versions, and platforms.

This directory has its own pinned dependencies and **no committed lockfile**. We don't commit the lockfiles because each smoke-test workflow installs it fresh with the package manager under test, so the repo's own dependencies can change without affecting the smoke tests.

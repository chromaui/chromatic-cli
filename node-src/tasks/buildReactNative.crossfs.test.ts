import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAndroid as buildAndroidActual } from '../lib/react-native/build';
import TestLogger from '../lib/testLogger';
import { buildArtifacts } from './buildReactNative';

// Real `fs` is used in this file. The platform build (gradle/xcodebuild) is
// stubbed so the test can hand a real artifact file to `buildArtifacts` and
// observe what happens when it tries to move that file into `ctx.sourceDir`.
vi.mock('../lib/react-native/build', () => ({
  buildAndroid: vi.fn(),
  buildIos: vi.fn(),
}));

const buildAndroid = vi.mocked(buildAndroidActual);
const task = { title: '', output: '' } as any;

let temporaryArtifactDirectory: string;
let workspaceDirectory: string;

beforeEach(() => {
  buildAndroid.mockReset();
  temporaryArtifactDirectory = mkdtempSync(path.join(os.tmpdir(), 'chromatic-exdev-src-'));
  workspaceDirectory = mkdtempSync(path.join(process.cwd(), '.chromatic-exdev-dest-'));
});

afterEach(() => {
  rmSync(temporaryArtifactDirectory, { recursive: true, force: true });
  rmSync(workspaceDirectory, { recursive: true, force: true });
});

describe('buildArtifacts cross-filesystem rename', () => {
  // Reproduces the `renameSync(2)` EXDEV bug. GitHub Actions Linux runners
  // mount `/tmp` as tmpfs and the workspace checkout on a separate volume,
  // so renaming a build artifact from `/tmp` into `ctx.sourceDir` trips the
  // kernel's cross-device check. macOS dev boxes typically share an APFS
  // volume for both, so the rename succeeds locally. Expected outcome:
  // passes on macOS, fails on GHA. After a copy+unlink fix, passes
  // everywhere.
  it('moves an android artifact from os.tmpdir() into ctx.sourceDir', async () => {
    const apkPath = path.join(temporaryArtifactDirectory, 'app-release.apk');
    writeFileSync(apkPath, 'fake-apk-bytes');

    buildAndroid.mockResolvedValueOnce({ artifactPath: apkPath, duration: 1 });

    const ctx = {
      options: {},
      flags: {},
      announcedBuild: { browsers: ['android'] },
      log: new TestLogger(),
      sourceDir: workspaceDirectory,
    } as any;

    await buildArtifacts(ctx, task);

    expect(existsSync(path.join(workspaceDirectory, 'storybook.apk'))).toBe(true);
  });
});

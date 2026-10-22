import { createHash } from 'crypto';
import { readFileSync, rmSync, symlinkSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { Stats } from '../../../types';
import TestLogger from '../../testLogger';
import { repository, write } from './__fixtures__/temporaryDisk';
import { readConfigEvidence } from './configEvidence';
import { ManifestInput } from './manifestInput';
import { realProjectFiles } from './projectFiles';

const main = './.storybook/main.ts';
const helper = './.storybook/data.json';
const buildControl = './build/control.ts';
const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');

function fixture() {
  const gitRoot = repository();
  const projectRoot = path.join(gitRoot, 'packages/ui');
  write(projectRoot, main, 'export default { framework: "@storybook/html-vite" };');
  write(projectRoot, helper, '{"label":"Button"}');
  write(projectRoot, buildControl, 'export const theme = "light";');
  write(
    projectRoot,
    'node_modules/@storybook/builder-vite/package.json',
    JSON.stringify({ name: '@storybook/builder-vite', version: '10.4.0' })
  );
  write(
    projectRoot,
    'node_modules/vite/package.json',
    JSON.stringify({ name: 'vite', version: '7.3.1' })
  );

  const log = new TestLogger();
  const projectFiles = realProjectFiles({ log });
  const input: ManifestInput = {
    log,
    projectRoot,
    gitRoot,
    configDir: path.join(projectRoot, '.storybook'),
    staticDirs: [],
    externals: [],
    untraced: [],
    projectFiles,
  };
  const stats: Stats = {
    modules: [
      {
        id: 1,
        name: helper,
        reasons: [{ moduleName: './src/Button.stories.ts' }],
      },
    ],
  };
  const relative = (file: string) => `./${path.relative(projectRoot, file)}`;

  function record() {
    const configFiles = projectFiles.listTree(input.configDir).map((file) => relative(file));
    const absentFiles: string[] = [];
    const files: Record<string, { hash: string; realPath: string; dependencies: string[] }> = {};
    for (const file of [...configFiles, buildControl]) {
      const absolute = path.resolve(projectRoot, file);
      files[file] = {
        hash: sha256(readFileSync(absolute)),
        realPath: relative(projectFiles.realPath(absolute)),
        dependencies: file === main ? [buildControl] : [],
      };
    }
    return {
      version: 1,
      status: 'complete',
      reason: 'supported-profile',
      builder: { name: '@storybook/builder-vite', version: '10.4.0', viteVersion: '7.3.1' },
      projectRoot: './',
      configDir: './.storybook',
      modulesHash: sha256(JSON.stringify(stats.modules)),
      environmentHash: sha256('production'),
      configFiles,
      absentFiles,
      roots: [main],
      files,
    };
  }

  return { input, stats, record };
}

describe('readConfigEvidence filesystem bindings', () => {
  it('verifies real source bytes and an out-of-directory build dependency', async () => {
    const { input, stats, record } = fixture();
    const result = await readConfigEvidence(
      { ...stats, turbosnapConfig: record() },
      input,
      () => undefined
    );

    expect(result.status).toBe('verified');
    if (result.status !== 'verified') throw new Error('Expected verified build evidence');
    expect(result.buildFiles).toEqual([
      path.resolve(input.projectRoot, main),
      path.resolve(input.projectRoot, buildControl),
    ]);
  });

  it.each([helper, buildControl])('rejects evidence after editing %s on disk', async (file) => {
    const { input, stats, record } = fixture();
    const metadata = record();
    write(input.projectRoot, file, 'changed after the build');

    expect(
      await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
    ).toEqual({ status: 'unavailable', reason: 'stale-build-dependencies' });
  });

  it('rejects a deleted build dependency outside the config inventory', async () => {
    const { input, stats, record } = fixture();
    const metadata = record();
    rmSync(path.resolve(input.projectRoot, buildControl));

    expect(
      await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
    ).toEqual({ status: 'unavailable', reason: 'stale-build-dependencies' });
  });

  it('rejects a symlink retarget even when its bytes and config inventory are unchanged', async () => {
    const { input, stats, record } = fixture();
    const firstTarget = write(input.projectRoot, 'assets/first.json', '{"label":"Button"}');
    const secondTarget = write(input.projectRoot, 'assets/second.json', '{"label":"Button"}');
    const link = path.resolve(input.projectRoot, helper);
    rmSync(link);
    symlinkSync(firstTarget, link);
    const metadata = record();
    const before = await readConfigEvidence(
      { ...stats, turbosnapConfig: metadata },
      input,
      () => undefined
    );
    expect(before.status).toBe('verified');

    rmSync(link);
    symlinkSync(secondTarget, link);
    expect(sha256(readFileSync(link))).toBe(metadata.files[helper].hash);
    expect(
      await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
    ).toEqual({ status: 'unavailable', reason: 'stale-build-dependencies' });
  });

  it('rejects an implicit config created outside the config directory after the build', async () => {
    const { input, stats, record } = fixture();
    const metadata = { ...record(), absentFiles: ['./vite.config.ts'] };
    const before = await readConfigEvidence(
      { ...stats, turbosnapConfig: metadata },
      input,
      () => undefined
    );
    expect(before.status).toBe('verified');

    write(input.projectRoot, 'vite.config.ts', 'export default {};');
    expect(
      await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
    ).toEqual({ status: 'unavailable', reason: 'stale-build-dependencies' });
  });

  it('rejects a removed config directory', async () => {
    const { input, stats, record } = fixture();
    const metadata = record();
    rmSync(input.configDir, { recursive: true });

    expect(
      await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
    ).toEqual({ status: 'unavailable', reason: 'stale-build-dependencies' });
  });
});

describe('readConfigEvidence graph identities', () => {
  it('rejects two metadata keys that resolve to the same source file', async () => {
    const { input, stats, record } = fixture();
    const metadata = record();
    metadata.files['./build/../build/control.ts'] = metadata.files[buildControl];

    expect(
      await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
    ).toEqual({ status: 'unavailable', reason: 'invalid-build-dependencies' });
  });

  it('rejects a config inventory containing aliases of the same file', async () => {
    const { input, stats, record } = fixture();
    const metadata = record();
    metadata.configFiles.push('./.storybook/../.storybook/data.json');

    expect(
      await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
    ).toEqual({ status: 'unavailable', reason: 'invalid-build-dependencies' });
  });

  it.each(['configDir', 'configFiles', 'roots'])(
    'rejects complete evidence without %s metadata',
    async (field) => {
      const { input, stats, record } = fixture();
      const metadata = Object.fromEntries(
        Object.entries(record()).filter(([key]) => key !== field)
      );

      expect(
        await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
      ).toEqual({ status: 'unavailable', reason: 'invalid-build-dependencies' });
    }
  );

  it('rejects complete evidence with no build roots', async () => {
    const { input, stats, record } = fixture();
    const metadata = { ...record(), roots: [] };

    expect(
      await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
    ).toEqual({ status: 'unavailable', reason: 'invalid-build-dependencies' });
  });

  it('rejects an inventory entry whose source binding is missing', async () => {
    const { input, stats, record } = fixture();
    const metadata = record();
    metadata.files = Object.fromEntries(
      Object.entries(metadata.files).filter(([file]) => file !== helper)
    );

    expect(
      await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
    ).toEqual({ status: 'unavailable', reason: 'invalid-build-dependencies' });
  });

  it.each(['constructor', 'toString'])(
    'rejects a dependency on an inherited property named %s',
    async (dependency) => {
      const { input, stats, record } = fixture();
      const metadata = record();
      metadata.files[main].dependencies.push(dependency);

      expect(
        await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
      ).toEqual({ status: 'unavailable', reason: 'invalid-build-dependencies' });
    }
  );

  it('rejects roots that omit the main config and its build dependency closure', async () => {
    const { input, stats, record } = fixture();
    const metadata = { ...record(), roots: [helper] };

    expect(
      await readConfigEvidence({ ...stats, turbosnapConfig: metadata }, input, () => undefined)
    ).toEqual({ status: 'unavailable', reason: 'stale-build-dependencies' });
  });
});

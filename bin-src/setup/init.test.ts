import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as clack from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from './init';

vi.mock('@clack/prompts', async (importOriginal) => {
  const original = await importOriginal<typeof import('@clack/prompts')>();
  return { ...original, log: { ...original.log, error: vi.fn() } };
});

let root: string;
let outsideFolder: string | undefined;
const previous = process.cwd();

// A folder outside the repository, owned by this test.
function outside() {
  outsideFolder ??= mkdtempSync(path.join(tmpdir(), 'init-test-outside-'));
  return outsideFolder;
}

function write(file: string, content: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
}

function commit() {
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=x', 'commit', '-qm', 'init'], {
    cwd: root,
  });
}

const changedFiles = () =>
  execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
  });

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'init-test-'));
  write('package.json', JSON.stringify({ name: 'root', private: true }));
  write('packages/app/package.json', JSON.stringify({ name: 'app' }));
  vi.stubEnv('CI', '1');
  vi.stubEnv('CHROMATIC_PROJECT_TOKEN', 'chpt_test');
});

afterEach(() => {
  process.chdir(previous);
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
  if (outsideFolder) rmSync(outsideFolder, { recursive: true, force: true });
  outsideFolder = undefined;
});

describe('init stops before writing anything', () => {
  it('when the project folder has no package.json', async () => {
    write('packages/app/tests/vitest.config.ts', 'export default {}\n');
    commit();
    process.chdir(root);

    await expect(
      main(['--yes', '--skip-install', '--project', 'packages/app/tests'])
    ).rejects.toMatchObject({ exitCode: 1, message: 'No package.json in packages/app/tests' });
    expect(changedFiles()).toBe('');
  });

  it('when the framework it sets up has no config here or above', async () => {
    commit();
    process.chdir(root);

    await expect(
      main(['--yes', '--skip-install', '--project', 'packages/app', '--framework', 'playwright'])
    ).rejects.toMatchObject({ exitCode: 1, message: 'No Playwright config' });
    expect(changedFiles()).toBe('');
  });

  it('when --framework storybook names a package with no Storybook', async () => {
    write('packages/app/playwright.config.ts', 'export default {}\n');
    // A .storybook folder without a main config isn't a Storybook.
    write('packages/app/.storybook/preview.ts', 'export default {}\n');
    commit();
    process.chdir(root);

    await expect(
      main(['--yes', '--skip-install', '--project', 'packages/app', '--framework', 'storybook'])
    ).rejects.toMatchObject({ exitCode: 1, message: 'No Storybook' });
    expect(changedFiles()).toBe('');
  });

  it("when the build script's -c folder has no Storybook, even with a .storybook next to it", async () => {
    write('packages/app/.storybook/main.ts', 'export default {}\n');
    write(
      'packages/app/package.json',
      JSON.stringify({ name: 'app', scripts: { 'build-storybook': 'storybook build -c missing' } })
    );
    commit();
    process.chdir(root);

    await expect(
      main(['--yes', '--skip-install', '--project', 'packages/app', '--framework', 'storybook'])
    ).rejects.toMatchObject({ exitCode: 1, message: 'No Storybook' });
    expect(changedFiles()).toBe('');
  });

  it('when --framework storybook names a test package below a root Storybook', async () => {
    write('packages/app/playwright.config.ts', 'export default {}\n');
    write('.storybook/main.ts', 'export default {}\n');
    commit();
    process.chdir(root);

    await expect(
      main(['--yes', '--skip-install', '--project', 'packages/app', '--framework', 'storybook'])
    ).rejects.toMatchObject({ exitCode: 1, message: 'Nothing to set up in packages/app' });
    expect(changedFiles()).toBe('');
  });

  it('when --framework storybook names a package whose Storybook builds from the root', async () => {
    write('.storybook/main.ts', 'export default {}\n');
    write('vitest.config.ts', 'export default {}\n');
    commit();
    process.chdir(root);

    await expect(
      main(['--yes', '--skip-install', '--project', 'packages/app', '--framework', 'storybook'])
    ).rejects.toMatchObject({ exitCode: 1, message: 'Nothing to set up in packages/app' });
    expect(changedFiles()).toBe('');
    // Points at the Storybook, not at the Vitest config next to it.
    expect(clack.log.error).toHaveBeenCalledWith(
      expect.stringContaining('Storybook builds from the repository root (.storybook)')
    );
  });
});

describe('init sets up', () => {
  it.each([
    [
      "the config's buildScriptName, with an absolute -c",
      (sb: string) => ({
        scripts: {
          'build-storybook': 'storybook build -c missing',
          'build:sb': `storybook build -c ${sb}`,
        },
        config: { buildScriptName: 'build:sb' },
      }),
    ],
    [
      "another script's -c folder when there's no build-storybook script",
      () => ({ scripts: { 'build:sb': 'storybook build -c sb' }, config: undefined }),
    ],
  ])('a Storybook found through %s', async (_name, layout) => {
    write('packages/app/sb/main.ts', 'export default {}\n');
    const { scripts, config } = layout(path.join(root, 'packages/app/sb'));
    write('packages/app/package.json', JSON.stringify({ name: 'app', scripts }));
    if (config) write('packages/app/chromatic.config.json', JSON.stringify(config));
    commit();
    process.chdir(root);
    // Nothing answers, so the token check gives up at once and init carries on.
    vi.stubEnv('CHROMATIC_INDEX_URL', 'http://127.0.0.1:9');

    await expect(
      main(['--yes', '--dry-run', '--project', 'packages/app', '--framework', 'storybook'])
    ).resolves.toBeUndefined();
  });

  it.each([
    ['a folder in the package', () => 'sb', 'storybook build'],
    ['the repository root', () => '../..', 'storybook build'],
    ['a folder outside the repository', () => outside(), 'storybook build'],
    // The config's folder wins over a -c that names a file.
    ['a folder in the package, over a -c file', () => 'sb', 'storybook build -c README.md'],
  ])(
    "a Storybook in %s, found through the config's storybookConfigDir without --project",
    async (_name, configDirectory, build) => {
      const folder = path.resolve(root, 'packages/app', configDirectory());
      mkdirSync(folder, { recursive: true });
      writeFileSync(path.join(folder, 'main.ts'), 'export default {}\n');
      write('packages/app/README.md', '# app\n');
      write(
        'packages/app/package.json',
        JSON.stringify({ name: 'app', scripts: { 'build-storybook': build } })
      );
      write(
        'packages/app/chromatic.config.json',
        JSON.stringify({ storybookConfigDir: configDirectory() })
      );
      commit();
      process.chdir(root);
      vi.stubEnv('CHROMATIC_INDEX_URL', 'http://127.0.0.1:9');

      await expect(main(['--yes', '--dry-run'])).resolves.toBeUndefined();
    }
  );
});

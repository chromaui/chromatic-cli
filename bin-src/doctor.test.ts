import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import * as clack from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectChecks, main } from './doctor';

let root: string;
const uiConfig = () => path.join(root, 'packages', 'ui', 'chromatic.config.json');
const previous = process.cwd();

function writePackage(name: string, setUp: boolean) {
  const directory = path.join(root, 'packages', name);
  mkdirSync(path.join(directory, '.storybook'), { recursive: true });
  writeFileSync(path.join(directory, '.storybook', 'main.ts'), 'export default {}\n');
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ name, scripts: { 'build-storybook': 'storybook build' } })
  );
  if (setUp) writeFileSync(path.join(directory, 'chromatic.config.json'), '{}\n');
}

function commit() {
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=x', 'commit', '-qm', 'init'], {
    cwd: root,
  });
}

async function turboSnapCheck(argv: string[] = []) {
  const checks = await collectChecks(root, argv);
  return checks.find((check) => check.title.includes('TurboSnap'));
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'doctor-test-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'root' }));
  vi.stubEnv('CI', '1');
});

afterEach(() => {
  process.chdir(previous);
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('doctor without a terminal', () => {
  it('asks for --project at a monorepo root with several set-up projects', async () => {
    writePackage('ui', true);
    writePackage('web', true);
    writePackage('docs', false);
    commit();
    process.chdir(root);

    await expect(main([])).rejects.toMatchObject({
      exitCode: 2,
      message: 'Found 2 projects with Chromatic set up. Pass --project <directory> to check one.',
    });
  });

  it('asks for --project when no project is set up', async () => {
    writePackage('ui', false);
    commit();
    process.chdir(root);

    await expect(main([])).rejects.toMatchObject({
      exitCode: 2,
      message: 'Found no projects with Chromatic set up. Pass --project <directory> to check one.',
    });
  });
});

describe('doctor where there is no project', () => {
  it('stops before any check and points to init', async () => {
    mkdirSync(path.join(root, 'packages', 'lib'), { recursive: true });
    writeFileSync(path.join(root, 'packages', 'lib', 'package.json'), '{ "name": "lib" }');
    commit();
    process.chdir(root);

    await expect(main(['--project', 'packages/lib', '--fix', '--yes'])).rejects.toMatchObject({
      exitCode: 2,
      message:
        'No Storybook or test config found in packages/lib. Run npx chromatic init --project packages/lib to set one up.',
    });
    expect(existsSync(path.join(root, 'packages', 'lib', 'chromatic.config.json'))).toBe(false);
  });

  it("fails a check when the build script's -c names a file, not a folder", async () => {
    // Absolute, as a script can pass it; doctor checks it rather than finding no project.
    const readme = path.join(root, 'README.md');
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ scripts: { 'build-storybook': `storybook build -c ${readme}` } })
    );
    writeFileSync(readme, '# app\n');
    commit();
    process.chdir(root);

    expect(await collectChecks(root)).toContainEqual(
      expect.objectContaining({ status: 'fail', title: 'No Storybook found at README.md' })
    );
    await expect(main(['--skip-update-check'])).rejects.toMatchObject({ exitCode: 1 });
    expect(await collectChecks(root, ['--storybook-build-dir', 'README.md'])).toContainEqual(
      expect.objectContaining({
        status: 'fail',
        title: "storybookBuildDir README.md isn't a folder",
        detail: "Point it at Storybook's build folder.",
      })
    );

    // storybookConfigDir naming the same file fails once, with the option values.
    writeFileSync(
      path.join(root, 'chromatic.config.json'),
      '{ "storybookConfigDir": "README.md" }'
    );
    const checks = await collectChecks(root);
    expect(checks).toContainEqual(
      expect.objectContaining({
        group: 'Values',
        status: 'fail',
        title: "storybookConfigDir README.md isn't a folder",
        detail: expect.stringContaining('.storybook'),
      })
    );
    const titles = checks.map((check) => check.title).join('\n');
    expect(titles).not.toMatch(/No Storybook found|README.md exists/);
  });

  it('points to init when a .storybook here or above is a file, not a folder', async () => {
    writeFileSync(path.join(root, '.storybook'), 'not a folder\n');
    mkdirSync(path.join(root, 'packages', 'lib'), { recursive: true });
    writeFileSync(path.join(root, 'packages', 'lib', 'package.json'), '{ "name": "lib" }');
    commit();
    process.chdir(root);

    await expect(main(['--project', 'packages/lib'])).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringContaining('Run npx chromatic init --project packages/lib'),
    });
    await expect(main([])).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringContaining('Run npx chromatic init to set one up'),
    });
    // --project names a folder.
    await expect(main(['--project', 'package.json'])).rejects.toMatchObject({
      exitCode: 1,
      message: 'No directory at package.json',
    });
    // Nor does it hide a set-up package from the root.
    writePackage('ui', true);
    commit();
    await expect(main(['--skip-update-check'])).resolves.toBeUndefined();
    // Unless the root's build script names it, which makes it the root's broken Storybook.
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ scripts: { 'build-storybook': 'storybook build -c .storybook' } })
    );
    commit();
    await expect(main(['--skip-update-check'])).rejects.toMatchObject({
      exitCode: 1,
      message: 'Some checks failed',
    });
  });

  it("offers no rebase onto a file, and fails a storybookBaseDir that's a file", async () => {
    const ui = path.join(root, 'packages', 'ui');
    mkdirSync(ui, { recursive: true });
    writeFileSync(path.join(ui, 'package.json'), '{ "name": "ui" }');
    writeFileSync(path.join(ui, '.storybook'), 'not a folder\n');
    writeFileSync(uiConfig(), '{ "storybookConfigDir": "packages/ui/.storybook" }\n');
    commit();

    const checks = await collectChecks(ui);
    const configDirectory = checks.find((c) => c.title.includes('ConfigDir'));
    expect(configDirectory?.status).toBe('fail');
    expect(configDirectory?.fix).toBeUndefined();
    // Relative to the repository root, where README.md is; packages/ui has none.
    writeFileSync(path.join(root, 'README.md'), '# app\n');
    expect(await collectChecks(ui, ['--storybook-base-dir', 'README.md'])).toContainEqual(
      expect.objectContaining({
        status: 'fail',
        title: "storybookBaseDir README.md isn't a folder",
      })
    );
  });

  it('still checks a set-up folder without a Storybook', async () => {
    writeFileSync(path.join(root, 'chromatic.config.json'), '{}\n');
    commit();
    process.chdir(root);

    await expect(main([])).rejects.toMatchObject({ exitCode: 1, message: 'Some checks failed' });
  });
});

describe('tests that run from a folder above the project', () => {
  beforeEach(() => {
    mkdirSync(path.join(root, 'packages', 'app'), { recursive: true });
    writeFileSync(path.join(root, 'packages', 'app', 'package.json'), '{ "name": "app" }');
  });

  it('fails unless Chromatic runs there or is pointed at its archives', async () => {
    writeFileSync(path.join(root, 'vitest.config.ts'), 'export default {};\n');
    commit();
    const app = path.join(root, 'packages', 'app');
    const runsFrom = async (argv: string[]) => {
      const checks = await collectChecks(app, argv);
      return checks.find((check) => check.title.includes('runs from'))?.status;
    };

    expect(await runsFrom(['--vitest'])).toBe('fail');
    vi.stubEnv('CHROMATIC_ARCHIVE_LOCATION', '../../.vitest/chromatic');
    // Vitest names files from where it runs, so TurboSnap needs that folder too.
    expect(await runsFrom(['--vitest'])).toBe('fail');
    expect(await runsFrom(['--vitest', '--storybook-base-dir', '.'])).toBe('pass');
    vi.stubEnv('CHROMATIC_ARCHIVE_LOCATION', '../../test-results');
    expect(await runsFrom(['--vitest', '--storybook-base-dir', '.'])).toBe('fail');
  });

  it("reads the archive location from the project's .env, as a build from there does", async () => {
    writeFileSync(path.join(root, 'playwright.config.ts'), 'export default {};\n');
    const app = path.join(root, 'packages', 'app');
    writeFileSync(path.join(app, '.env'), 'CHROMATIC_ARCHIVE_LOCATION=../../test-results\n');
    commit();

    const status = async () => {
      const checks = await collectChecks(app, ['--playwright']);
      return checks.find((check) => check.title.includes('runs from'))?.status;
    };
    expect(await status()).toBe('pass');
    // A variable already set wins over .env, as it does for a build.
    vi.stubEnv('CHROMATIC_ARCHIVE_LOCATION', 'elsewhere');
    expect(await status()).toBe('fail');
  });

  it('points the no-project gate at that folder instead of init', async () => {
    writeFileSync(path.join(root, 'playwright.config.ts'), 'export default {};\n');
    commit();
    process.chdir(root);

    await expect(main(['--project', 'packages/app'])).rejects.toMatchObject({
      exitCode: 2,
      message:
        'No Storybook or test config found in packages/app. Playwright runs from the repository root (playwright.config.ts), so run doctor and Chromatic from the repository root.',
    });
  });
});

describe('TurboSnap for Vitest', () => {
  it('turns TurboSnap on only when chromaticPlugin writes what it reads', async () => {
    const config = (plugin: string) =>
      writeFileSync(
        path.join(root, 'vitest.config.ts'),
        `export default { plugins: [${plugin}] };\n`
      );
    writeFileSync(path.join(root, 'chromatic.config.json'), '{ "vitest": true }\n');
    config('chromaticPlugin({ turboSnap: true })');
    commit();

    const readable = await turboSnapCheck();
    expect(readable?.fix?.summary).toContain('onlyChanged');
    expect(readable?.fix?.question).toBeUndefined();

    config('chromaticPlugin()');
    const missing = await turboSnapCheck();
    expect(missing?.fix).toBeUndefined();
    const on = await turboSnapCheck(['--only-changed']);
    expect(on?.status).toBe('fail');

    config('chromaticPlugin(options)');
    const unreadable = await turboSnapCheck();
    expect(unreadable?.fix?.question).toContain('turboSnap: true');
  });
});

describe('TurboSnap without a project', () => {
  it("isn't offered where doctor found no Storybook or Vitest config", async () => {
    commit();

    for (const argv of [[], ['--vitest']]) {
      const check = await turboSnapCheck(argv);
      expect(check?.title).toBe("TurboSnap isn't on here");
      expect(check?.fix).toBeUndefined();
    }
  });
});

describe('doctor --apply', () => {
  it('applies a fix that asks a question, without a terminal', async () => {
    writePackage('ui', true);
    commit();
    process.chdir(root);

    await main([
      '--project',
      'packages/ui',
      '--apply',
      'onlyChanged.enable',
      '--skip-update-check',
    ]);

    expect(JSON.parse(readFileSync(uiConfig(), 'utf8'))).toMatchObject({ onlyChanged: true });
    // Only the named fix: chromatic.addDependency is offered too, but needs --yes.
    expect(readFileSync(path.join(root, 'packages', 'ui', 'package.json'), 'utf8')).not.toContain(
      'devDependencies'
    );
  });

  it('names the fixes the applied ones made available, with their commands', async () => {
    writePackage('ui', true);
    writeFileSync(uiConfig(), '{ "storybookConfigDir": "packages/ui/.storybook" }\n');
    commit();
    process.chdir(root);
    const info = vi.spyOn(clack.log, 'info');

    await main([
      '--project',
      'packages/ui',
      '--apply',
      'storybookConfigDir.rebase',
      '--skip-update-check',
    ]);

    // TurboSnap is offered only once doctor finds the Storybook, so this run can't apply it.
    expect(JSON.parse(readFileSync(uiConfig(), 'utf8'))).toEqual({
      storybookConfigDir: '.storybook',
    });
    const printed = info.mock.calls.map(([message]) => stripVTControlCharacters(String(message)));
    expect(printed).toContainEqual(
      expect.stringContaining(
        'npx chromatic doctor --skip-update-check --project packages/ui --apply onlyChanged.enable'
      )
    );
    expect(printed.join('\n')).not.toContain('--apply chromatic.addDependency');
  });

  it("exits 2 and applies nothing when a named fix isn't offered", async () => {
    writePackage('ui', true);
    commit();
    process.chdir(root);

    await expect(
      main([
        '--project',
        'packages/ui',
        '--apply',
        'onlyChanged.enable',
        '--apply',
        'storybookConfigDir.rebase',
        '--skip-update-check',
      ])
    ).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringContaining(
        "doesn't offer storybookConfigDir.rebase yet. It offers chromatic.addDependency, onlyChanged.enable. Some fixes appear only after another is applied. Apply onlyChanged.enable first with npx chromatic doctor --skip-update-check --project packages/ui --apply onlyChanged.enable, then run doctor again"
      ),
    });
    expect(readFileSync(uiConfig(), 'utf8')).toBe('{}\n');
  });

  it('exits 2 and applies nothing when an --apply names no fix', async () => {
    writePackage('ui', true);
    commit();
    process.chdir(root);

    for (const apply of [
      ['--apply'],
      ['--apply='],
      ['--apply', ''],
      ['--apply', ' '],
      ['--no-apply'],
      ['--apply', 'onlyChanged.enable', '--apply'],
    ]) {
      await expect(main(['--project', 'packages/ui', ...apply])).rejects.toMatchObject({
        exitCode: 2,
        message: expect.stringContaining('--apply needs the ID of a fix'),
      });
    }
    expect(readFileSync(uiConfig(), 'utf8')).toBe('{}\n');
    // After --, it's an argument, not the flag.
    await expect(
      main(['--project', 'packages/ui', '--skip-update-check', '--', '--apply'])
    ).resolves.toBeUndefined();
  });
});

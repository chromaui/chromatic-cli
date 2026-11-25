import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectChecks, main } from './doctor';

let root: string;
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

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { installableVersion } from './install';

// What `yarn config get` and `pnpm config get` print for each setting; npm reads its real config.
const settings: Record<string, string> = {};
vi.mock('execa', async (importOriginal) => {
  const original = await importOriginal<typeof import('execa')>();
  return {
    ...original,
    execa: vi.fn((command: string, args: string[], options: object) =>
      command === 'yarn' || command === 'pnpm'
        ? Promise.resolve({ stdout: settings[args[2]] ?? '' })
        : original.execa(command, args, options)
    ),
  };
});

let directory: string;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'install-test-'));
  writeFileSync(path.join(directory, 'package.json'), '{ "name": "app" }');
  // npm, whichever package manager runs the tests: a lockfile and a git repository of its own.
  writeFileSync(path.join(directory, 'package-lock.json'), '{}');
  execFileSync('git', ['init', '-q'], { cwd: directory });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        'dist-tags': { latest: '18.15.3' },
        time: {
          created: hoursAgo(1000),
          '18.15.1': hoursAgo(72),
          '18.15.2': hoursAgo(30),
          '18.15.3-beta.0': hoursAgo(26),
          '18.15.3': hoursAgo(2),
          // Old enough, but above the version asked for.
          '18.16.0': hoursAgo(48),
        },
      }),
    }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(directory, { recursive: true, force: true });
});

it('picks the newest stable release older than the package manager allows', async () => {
  writeFileSync(path.join(directory, '.npmrc'), 'min-release-age=1\n');

  expect(await installableVersion('chromatic', directory, '18.15.3')).toBe('18.15.2');
  expect(await installableVersion('@chromatic-com/vitest', directory)).toBe('18.15.2');
});

it("reads publish times from the project's registry", async () => {
  writeFileSync(
    path.join(directory, '.npmrc'),
    'min-release-age=1\nregistry=https://npm.example.test/proxy\n'
  );

  await installableVersion('@chromatic-com/vitest', directory);
  expect(fetch).toHaveBeenCalledWith(
    'https://npm.example.test/proxy/@chromatic-com%2fvitest',
    expect.anything()
  );
});

it('keeps the wanted version without a minimum release age', async () => {
  expect(await installableVersion('chromatic', directory, '18.15.3')).toBe('18.15.3');
});

it.each([
  ['the wanted version', '["chromatic@18.15.3"]', '18.15.3'],
  ['another version', '["chromatic@18.15.1"]', '18.15.2'],
  ['every version', '["chrom*"]', '18.15.3'],
  ['it in a second entry', '["chromatic@18.15.1", "chromatic@18.15.3"]', '18.15.3'],
])('keeps the gate on versions Yarn exempts only when it exempts %s', async (_, list, version) => {
  writeFileSync(
    path.join(directory, 'package.json'),
    '{ "name": "app", "packageManager": "yarn@4.18.0" }'
  );
  Object.assign(settings, { npmMinimalAgeGate: '1d', npmPreapprovedPackages: list });

  expect(await installableVersion('chromatic', directory, '18.15.3')).toBe(version);
  expect(execa).toHaveBeenCalledWith(
    'yarn',
    ['config', 'get', 'npmPreapprovedPackages', '--json'],
    expect.anything()
  );
});

it("reads a scoped package's name in Yarn's exemptions", async () => {
  writeFileSync(
    path.join(directory, 'package.json'),
    '{ "name": "app", "packageManager": "yarn@4.18.0" }'
  );
  Object.assign(settings, {
    npmMinimalAgeGate: '1d',
    npmPreapprovedPackages: '["@chromatic-com/*"]',
  });

  expect(await installableVersion('@chromatic-com/vitest', directory, '18.15.3')).toBe('18.15.3');
});

it.each([
  ['the first entry exempts it', '["chromatic@18.15.3", "chromatic@18.15.1"]', '18.15.3'],
  ['only a later entry exempts it', '["chromatic@18.15.1", "chromatic@18.15.3"]', '18.15.2'],
])('keeps the gate on versions pnpm exempts when %s', async (_, list, version) => {
  writeFileSync(
    path.join(directory, 'package.json'),
    '{ "name": "app", "packageManager": "pnpm@10.24.0" }'
  );
  Object.assign(settings, { minimumReleaseAge: '1440', minimumReleaseAgeExclude: list });

  expect(await installableVersion('chromatic', directory, '18.15.3')).toBe(version);
});

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { cliVersionChecks, readCliVersions } from './cliVersion';
import type { DoctorInput } from './doctorInput';

const cliVersionCheck = (...args: Parameters<typeof cliVersionChecks>) =>
  cliVersionChecks(...args)[0];

// Every folder a test made, since some tests make several.
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), 'cli-version-'));
  directories.push(directory);
  return directory;
}

function packageJson(range: string) {
  const directory = temporaryDirectory();
  const file = path.join(directory, 'package.json');
  writeFileSync(
    file,
    JSON.stringify({ dependencies: { react: '^19.0.0' }, devDependencies: { chromatic: range } })
  );
  return file;
}

const day = 24 * 60 * 60 * 1000;
const ago = (milliseconds: number) => new Date(Date.now() - milliseconds).toISOString();

const fixedRange = (check: ReturnType<typeof cliVersionCheck>) =>
  check.fix && JSON.parse(check.fix.edits[0].content).devDependencies.chromatic;

describe('cliVersionCheck', () => {
  it('offers each newer major, minor and patch, warns about the major, and defaults to the minor', () => {
    const published = Object.fromEntries(
      ['16.9.9', '16.9.12', '16.14.0', '17.0.0', '18.0.1'].map((version) => [version, ago(day)])
    );
    const check = cliVersionCheck(
      { installed: '16.9.9', latest: '18.0.1', published },
      '16.9.9',
      packageJson('16.9.9')
    );
    expect(check).toMatchObject({
      status: 'warn',
      title: 'chromatic 16.9.9 is installed, 2 major versions behind',
    });
    const warning = [
      "Major versions can include breaking changes that doctor doesn't fix automatically. Read what changed in each one before you update:",
      '17.0.0: https://github.com/chromaui/chromatic-cli/releases/tag/v17.0.0',
      '18.0.0: https://github.com/chromaui/chromatic-cli/releases/tag/v18.0.0',
    ].join('\n');
    expect(check.detail).toBe(`The latest release is 18.0.1. ${warning}`);
    expect(check.fix?.choices?.map(({ key, label, warning }) => ({ key, label, warning }))).toEqual(
      [
        { key: 'major', label: 'Major update to 18.0.1', warning },
        { key: 'minor', label: 'Minor update to 16.14.0', warning: undefined },
        { key: 'patch', label: 'Patch update to 16.9.12', warning: undefined },
      ]
    );
    expect(check.fix?.choices?.map((choice) => fixedRange({ ...check, fix: choice.fix }))).toEqual([
      '18.0.1',
      '16.14.0',
      '16.9.12',
    ]);
    // --yes applies the fix itself: the newest release in the installed major, without a question.
    expect(fixedRange(check)).toBe('16.14.0');
    expect(check.fix?.question).toBeUndefined();
    expect(check.fix?.install).toBe(true);
  });

  it('asks before a major update when it is the only one, so --yes skips it', () => {
    const check = cliVersionCheck(
      {
        installed: '17.20.0',
        latest: '18.0.0',
        published: { '17.20.0': ago(day), '18.0.0': ago(day) },
      },
      '~17.20.0',
      packageJson('~17.20.0')
    );
    expect(check.fix?.choices?.map((choice) => choice.key)).toEqual(['major']);
    expect(check.fix?.question).toBe('Major update to 18.0.0, a new major version?');
    expect(fixedRange(check)).toBe('~18.0.0');
  });

  it('links the changelog for majors older than the first GitHub release, 8.0.0', () => {
    const check = cliVersionCheck(
      { installed: '6.24.1', latest: '8.0.0', published: { '7.0.0': ago(day), '8.0.0': ago(day) } },
      '^6.0.0',
      packageJson('^6.0.0')
    );
    expect(check.detail).toContain(
      '7.0.0: https://github.com/chromaui/chromatic-cli/blob/main/CHANGELOG.md\n8.0.0: https://github.com/chromaui/chromatic-cli/releases/tag/v8.0.0'
    );
  });

  it('offers the newest minor and the newest patch, defaulting to the minor', () => {
    const versions = {
      installed: '18.10.0',
      latest: '18.15.3',
      published: { '18.10.4': ago(day), '18.15.3': ago(day) },
    };
    const check = cliVersionCheck(versions, '~18.10.0', packageJson('~18.10.0'));
    expect(check.status).toBe('info');
    expect(check.fix?.choices?.map((choice) => choice.label)).toEqual([
      'Minor update to 18.15.3',
      'Patch update to 18.10.4',
    ]);
    expect(fixedRange(check)).toBe('~18.15.3');
    expect(check.fix?.question).toBeUndefined();

    // ^18.10.4 would install 18.15.3 too, so with ^ the patch update isn't a choice.
    const caret = cliVersionCheck(versions, '^18.10.0', packageJson('^18.10.0'));
    expect(caret.fix?.choices).toBeUndefined();
    expect(fixedRange(caret)).toBe('^18.15.3');
  });

  it('shows a minor or patch gap without warning, and keeps how the range pins versions', () => {
    const minor = cliVersionCheck(
      { installed: '18.10.4', latest: '18.15.0' },
      '18.10.4',
      packageJson('18.10.4')
    );
    expect(minor).toMatchObject({
      status: 'info',
      title: 'chromatic 18.10.4 is installed, 5 minor versions behind',
    });
    expect(fixedRange(minor)).toBe('18.15.0');
    // doctor runs the project's install after the fix, so the update takes effect.
    expect(minor.fix?.install).toBe(true);

    const patch = cliVersionCheck(
      { installed: '18.15.1', latest: '18.15.3' },
      '~18.15.1',
      packageJson('~18.15.1')
    );
    expect(patch).toMatchObject({
      status: 'info',
      title: 'chromatic 18.15.1 is installed, 2 patch versions behind',
    });
    expect(fixedRange(patch)).toBe('~18.15.3');
  });

  describe('when the package manager only installs releases older than a minimum age', () => {
    const published = {
      created: ago(1000 * day),
      '18.10.0': ago(30 * day),
      '18.15.2': ago(2 * day),
      // Newer than 18.15.2 and old enough, but a prerelease.
      '18.15.3--canary.1': ago(3 * day),
      '18.15.3': ago(2 * 60 * 60 * 1000),
      // Old enough, but newer than the latest release.
      '18.16.0': ago(3 * day),
    };

    it('updates to the newest stable release old enough to install', () => {
      const check = cliVersionCheck(
        { installed: '18.10.0', latest: '18.15.3', published, minimumAge: day },
        '^18.10.0',
        packageJson('^18.10.0')
      );
      expect(check).toMatchObject({
        status: 'info',
        title: 'chromatic 18.10.0 is installed, 5 minor versions behind',
        detail:
          'The latest release is 18.15.3. Your package manager only installs releases at least 1 day old, so the newest one it installs is 18.15.2.',
      });
      expect(fixedRange(check)).toBe('^18.15.2');
      expect(check.fix?.summary).toBe(
        'Update chromatic to ^18.15.2 in package.json and install it'
      );
    });

    it('updates to a release the package manager exempts from its minimum age', () => {
      const check = cliVersionCheck(
        {
          installed: '18.10.0',
          latest: '18.15.3',
          published,
          minimumAge: 3 * day,
          // Too young, like the latest release, but exempt.
          exempt: ['18.15.2'],
        },
        '^18.10.0',
        packageJson('^18.10.0')
      );
      expect(fixedRange(check)).toBe('^18.15.2');
      expect(check.detail).toBe(
        'The latest release is 18.15.3. Your package manager only installs releases at least 3 days old, or ones it exempts, so the newest one it installs is 18.15.2.'
      );
    });

    it('offers no fix when no newer release is old enough yet', () => {
      const check = cliVersionCheck(
        { installed: '18.15.2', latest: '18.15.3', published, minimumAge: 3 * 60 * 60 * 1000 },
        '^18.15.2',
        packageJson('^18.15.2')
      );
      expect(check.fix).toBeUndefined();
      expect(check.detail).toBe(
        "The latest release is 18.15.3. Your package manager only installs releases at least 3 hours old, so there's nothing newer to update to yet."
      );
    });

    it('updates to the latest release once it is old enough', () => {
      const check = cliVersionCheck(
        { installed: '18.10.0', latest: '18.15.3', published, minimumAge: 60 * 60 * 1000 },
        '^18.10.0',
        packageJson('^18.10.0')
      );
      expect(fixedRange(check)).toBe('^18.15.3');
      expect(check.detail).toBe('The latest release is 18.15.3.');
    });

    it('leaves it to the install when the registry gives no publish time for the latest release', () => {
      const { '18.15.3': _latest, ...withoutLatest } = published;
      const check = cliVersionCheck(
        { installed: '18.10.0', latest: '18.15.3', published: withoutLatest, minimumAge: day },
        '^18.10.0',
        packageJson('^18.10.0')
      );
      expect(fixedRange(check)).toBe('^18.15.3');
    });
  });

  it('says to run the install when package.json already asks for the latest release', () => {
    // 18.10.4 is newer than the installed copy, but older than what package.json asks for.
    const check = cliVersionCheck(
      { installed: '18.10.0', latest: '18.15.3', published: { '18.10.4': ago(day) } },
      '^18.15.3',
      packageJson('^18.15.3')
    );
    expect(check.fix).toBeUndefined();
    expect(check.detail).toContain('Run your install to update it.');
  });

  it('says to run the install when package.json already asks for a newer major', () => {
    const check = cliVersionCheck(
      { installed: '18.10.0', latest: '19.2.0', published: { '19.2.0': ago(day) } },
      '^19.0.0',
      packageJson('^19.0.0')
    );
    expect(check.fix).toBeUndefined();
    expect(check.detail).toContain('package.json already asks for ^19.0.0. Run your install');
  });

  it('says to change a range doctor does not rewrite in package.json itself', () => {
    const check = cliVersionCheck(
      { installed: '16.9.9', latest: '18.0.1', published: { '18.0.1': ago(day) } },
      '>=16.0.0',
      packageJson('>=16.0.0')
    );
    expect(check.fix).toBeUndefined();
    // The advice comes before the release notes, whose links each take a line.
    expect(check.detail).toMatch(
      /^The latest release is 18\.0\.1\. Doctor only updates a range such as \^1\.2\.3, ~1\.2\.3 or 1\.2\.3, so change chromatic >=16\.0\.0 in package\.json yourself, then run your install\. Major versions can include/
    );
  });

  it.each(['catalog:', 'workspace:*'])(
    'offers no fix for %s, which is defined elsewhere',
    (range) => {
      const check = cliVersionCheck(
        { installed: '18.10.0', latest: '18.15.3' },
        range,
        packageJson(range)
      );
      expect(check.fix).toBeUndefined();
      expect(check.detail).toContain(`Update chromatic ${range} where it's defined`);
    }
  );

  it('passes for the latest release, and tells a newer prerelease apart from it', () => {
    const file = packageJson('^18.15.3');
    expect(
      cliVersionCheck({ installed: '18.15.3', latest: '18.15.3' }, '^18.15.3', file)
    ).toMatchObject({
      status: 'pass',
      title: 'chromatic 18.15.3 is installed, the latest release',
    });
    expect(
      cliVersionCheck({ installed: '18.16.0-canary.1', latest: '18.15.3' }, '^18.15.3', file)
    ).toMatchObject({
      status: 'pass',
      title: 'chromatic 18.16.0-canary.1 is installed, newer than the latest release',
      detail: 'The latest release is 18.15.3.',
    });
  });

  it('says why it could not compare when the latest release is unknown', () => {
    const check = cliVersionCheck(
      { installed: '18.10.0', noLatest: "Tried to check the npm registry and couldn't: offline" },
      '^18.10.0',
      packageJson('^18.10.0')
    );
    expect(check).toMatchObject({
      status: 'info',
      title: 'chromatic 18.10.0 is installed',
      detail: "Tried to check the npm registry and couldn't: offline",
    });
  });
});

describe('readCliVersions', () => {
  it('reads the version installed now, after an install in the same run replaced it', async () => {
    const root = temporaryDirectory();
    const install = (version: string) => {
      const store = path.join(root, 'store', version);
      mkdirSync(store, { recursive: true });
      writeFileSync(
        path.join(store, 'package.json'),
        JSON.stringify({ name: 'chromatic', version })
      );
      rmSync(path.join(root, 'node_modules', 'chromatic'), { force: true });
      // Like pnpm, node_modules links to the version's own folder.
      symlinkSync(store, path.join(root, 'node_modules', 'chromatic'), 'junction');
    };
    mkdirSync(path.join(root, 'node_modules'));
    const packageJson = { devDependencies: { chromatic: '^16.9.0' } };
    const packageJsonPath = path.join(root, 'package.json');
    writeFileSync(packageJsonPath, JSON.stringify(packageJson));
    const input = {
      cwd: root,
      packageJson,
      packageJsonPath,
      options: { skipUpdateCheck: true },
    } as unknown as DoctorInput;

    install('16.9.0');
    await expect(readCliVersions(input)).resolves.toMatchObject({ installed: '16.9.0' });
    install('16.10.1');
    // Node remembers where it resolved a package, which would still say 16.9.0.
    await expect(readCliVersions(input)).resolves.toMatchObject({ installed: '16.10.1' });
  });
});

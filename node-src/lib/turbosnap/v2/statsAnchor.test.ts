import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { Stats } from '../../../types';
import { buildManifest } from './manifest';
import { realProjectFiles } from './projectFiles';
import { AnchorInput, getAnchorMismatchReason, getSourceModuleResolution } from './statsAnchor';

// The fixtures below are real directories on disk — the anchor damage is only visible against real
// bytes — but they install no Storybook, and resolving its version is the one thing that would throw.
vi.mock('./storybookVersion', () => ({
  resolveStorybookVersion: () => '9.1.20',
}));

// A vite-shaped graph: relative module names only, no `nameForCondition`, so the anchor is the sole
// thing deciding which files get hashed. Both fixture packages below satisfy every path in it.
const VITE_STATS: Stats = {
  modules: [
    { id: 1, name: './iframe.html', reasons: [] },
    {
      id: 2,
      name: '/virtual:/@storybook/builder-vite/storybook-stories.js',
      reasons: [{ moduleName: './iframe.html' }],
    },
    {
      id: 3,
      name: './src/lib/Badge/Badge.stories.tsx',
      reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/storybook-stories.js' }],
    },
    {
      id: 4,
      name: './src/lib/Badge/Badge.tsx',
      reasons: [{ moduleName: './src/lib/Badge/Badge.stories.tsx' }],
    },
    { id: 5, name: './.storybook/preview.ts', reasons: [{ moduleName: './iframe.html' }] },
  ],
} as unknown as Stats;

const temporaryDirectories: string[] = [];

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

/**
 * Builds a monorepo of near-identical sibling packages, which is what makes a wrong anchor dangerous:
 * every path in the stats resolves under either one. `badge` is the only content that differs, so a
 * hash read off the wrong sibling is visible.
 *
 * @param packages
 *
 * @returns
 */
function givenSiblingPackages(packages: Record<string, { badge: string }>) {
  const repository = mkdtempSync(path.join(tmpdir(), 'anchor-'));
  temporaryDirectories.push(repository);
  writeFileSync(path.join(repository, 'package.json'), JSON.stringify({ name: 'repo' }));

  const roots: Record<string, string> = {};
  for (const [name, { badge }] of Object.entries(packages)) {
    const root = path.join(repository, 'packages', name);
    mkdirSync(path.join(root, 'src/lib/Badge'), { recursive: true });
    mkdirSync(path.join(root, '.storybook'), { recursive: true });
    mkdirSync(path.join(root, 'storybook-static'), { recursive: true });
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name }));
    writeFileSync(path.join(root, 'src/lib/Badge/Badge.tsx'), badge);
    writeFileSync(
      path.join(root, 'src/lib/Badge/Badge.stories.tsx'),
      `import { Badge } from './Badge';\nexport default { component: Badge };\n`
    );
    writeFileSync(path.join(root, '.storybook/preview.ts'), 'export const parameters = {};\n');
    writeFileSync(
      path.join(root, 'storybook-static/preview-stats.json'),
      JSON.stringify(VITE_STATS)
    );
    roots[name] = root;
  }

  return { repository, roots };
}

/** An anchor named only by the part a case is about; the rest is what production always supplies. */
type AnchorOverrides = Partial<AnchorInput> & Pick<AnchorInput, 'projectRoot'>;

/**
 * Completes an anchor. The defaults live here rather than in the module under test, where a default
 * could mask a wiring bug instead of failing.
 *
 * @param overrides The anchor fields the case names.
 *
 * @returns The complete anchor.
 */
function anchorInput(overrides: AnchorOverrides): AnchorInput {
  return {
    repositoryRoot: overrides.projectRoot,
    statsPath: statsPathFor(overrides.projectRoot),
    configDir: '.storybook',
    // The fixtures are real directories, so the real disk is the disk under test.
    projectFiles: realProjectFiles(),
    ...overrides,
  };
}

// The production caller resolves the stats root once and hands it to the anchor check, so the tests
// exercise the same pairing.
function anchorMismatchFor(stats: Stats, overrides: AnchorOverrides) {
  const input = anchorInput(overrides);
  return getAnchorMismatchReason(stats, input, getSourceModuleResolution(stats, input));
}

function statsPathFor(projectRoot: string) {
  return path.join(projectRoot, 'storybook-static/preview-stats.json');
}

describe('getAnchorMismatchReason', () => {
  it('accepts the anchor the stats file belongs to', () => {
    const { roots } = givenSiblingPackages({
      ui: { badge: 'export const Badge = () => "ui";\n' },
      'marketing-ui': { badge: 'export const Badge = () => "marketing";\n' },
    });

    expect(
      anchorMismatchFor(VITE_STATS, {
        projectRoot: roots.ui,
        builderName: '@storybook/react-vite',
      })
    ).toBeUndefined();
  });

  it('refuses a structurally similar sibling, which no emptiness guard can detect', async () => {
    const { roots } = givenSiblingPackages({
      ui: { badge: 'export const Badge = () => "ui";\n' },
      'marketing-ui': { badge: 'export const Badge = () => "marketing";\n' },
    });
    const statsPath = statsPathFor(roots.ui);

    // First, the damage: with the wrong sibling as the anchor the manifest is complete — a story is
    // found and nothing is empty — but its hashes are read off the other package's bytes.
    const outOfGraph = {
      configDir: '.storybook',
      staticDirs: [],
      projectFiles: realProjectFiles(),
    };
    const correct = await buildManifest(VITE_STATS, roots.ui, outOfGraph);
    const wrong = await buildManifest(VITE_STATS, roots['marketing-ui'], outOfGraph);
    const storyFile = './src/lib/Badge/Badge.stories.tsx';
    expect(correct.storyFileHashes.get(storyFile)).toBeDefined();
    expect(wrong.storyFileHashes.get(storyFile)).toBeDefined();
    expect(wrong.storyFileHashes.get(storyFile)).not.toBe(correct.storyFileHashes.get(storyFile));

    // Which is what the guard refuses to build.
    expect(
      anchorMismatchFor(VITE_STATS, {
        projectRoot: roots['marketing-ui'],
        statsPath,
        builderName: '@storybook/react-vite',
      })
    ).toMatchObject({ subreason: 'statsFileOutsideProject' });
  });

  it('accepts a stats file built into a directory above the project', () => {
    const { repository, roots } = givenSiblingPackages({
      ui: { badge: 'export const Badge = () => "ui";\n' },
    });
    const statsPath = path.join(repository, 'dist/storybook/preview-stats.json');
    mkdirSync(path.dirname(statsPath), { recursive: true });
    writeFileSync(statsPath, JSON.stringify(VITE_STATS));

    expect(
      anchorMismatchFor(VITE_STATS, {
        projectRoot: roots.ui,
        statsPath,
        builderName: '@storybook/react-vite',
      })
    ).toBeUndefined();
  });

  it('accepts a stats file with no owning package, as the CLI’s own temporary build has', () => {
    const { roots } = givenSiblingPackages({ ui: { badge: 'export const Badge = () => "ui";\n' } });
    const buildDirectory = mkdtempSync(path.join(tmpdir(), 'chromatic-'));
    temporaryDirectories.push(buildDirectory);
    const statsPath = path.join(buildDirectory, 'preview-stats.json');
    writeFileSync(statsPath, JSON.stringify(VITE_STATS));

    expect(
      anchorMismatchFor(VITE_STATS, {
        projectRoot: roots.ui,
        statsPath,
        builderName: '@storybook/react-vite',
      })
    ).toBeUndefined();
  });

  it('does not treat a plain file named like the config directory as an owning project', () => {
    const { roots } = givenSiblingPackages({ ui: { badge: 'export const Badge = () => "ui";\n' } });
    const buildDirectory = mkdtempSync(path.join(tmpdir(), 'chromatic-'));
    temporaryDirectories.push(buildDirectory);
    const statsPath = path.join(buildDirectory, 'preview-stats.json');
    writeFileSync(statsPath, JSON.stringify(VITE_STATS));
    // The walk looks for a config *directory*. A file of the same name holds no Storybook config, so
    // it cannot make this directory the project the stats belong to.
    writeFileSync(path.join(buildDirectory, '.storybook'), '');

    expect(
      anchorMismatchFor(VITE_STATS, {
        projectRoot: roots.ui,
        statsPath,
        builderName: '@storybook/react-vite',
      })
    ).toBeUndefined();
  });

  describe('the builder the stats were produced by', () => {
    it('refuses vite stats anchored at a project that declares webpack', () => {
      const { roots } = givenSiblingPackages({
        ui: { badge: 'export const Badge = () => "ui";\n' },
      });

      expect(
        anchorMismatchFor(VITE_STATS, {
          projectRoot: roots.ui,
          builderName: '@storybook/react-webpack5',
        })
      ).toMatchObject({ subreason: 'builderMismatch' });
    });

    it('refuses non-vite stats anchored at a project that declares vite', () => {
      const { roots } = givenSiblingPackages({
        ui: { badge: 'export const Badge = () => "ui";\n' },
      });
      const webpackStats = {
        modules: [
          { id: 1, name: './storybook-stories.js', reasons: [] },
          {
            id: 2,
            name: './src/lib/Badge/Badge.stories.tsx',
            reasons: [{ moduleName: './storybook-stories.js' }],
          },
        ],
      } as unknown as Stats;

      expect(
        anchorMismatchFor(webpackStats, {
          projectRoot: roots.ui,
          builderName: '@storybook/react-vite',
        })
      ).toMatchObject({ subreason: 'builderMismatch' });
    });

    it('gives no verdict for a framework whose name does not name its builder', () => {
      const { roots } = givenSiblingPackages({
        ui: { badge: 'export const Badge = () => "ui";\n' },
      });

      expect(
        anchorMismatchFor(VITE_STATS, {
          projectRoot: roots.ui,
          builderName: '@storybook/nextjs',
        })
      ).toBeUndefined();
    });
  });

  it('accepts a builder entry that exists outside the project', () => {
    const { repository, roots } = givenSiblingPackages({
      ui: { badge: 'export const Badge = () => "ui";\n' },
    });
    const entry = path.join(
      repository,
      'node_modules/.cache/storybook-rsbuild-builder/storybook-config-entry.js'
    );
    mkdirSync(path.dirname(entry), { recursive: true });
    writeFileSync(entry, '');
    const rsbuildStats = {
      modules: [
        {
          id: 1,
          name: './storybook-config-entry.js',
          nameForCondition: entry,
          reasons: [],
        },
        {
          id: 2,
          name: './src/lib/Badge/Badge.stories.tsx',
          reasons: [{ moduleName: './storybook-config-entry.js' }],
        },
      ],
    } as unknown as Stats;

    expect(
      anchorMismatchFor(rsbuildStats, {
        projectRoot: roots.ui,
        builderName: 'storybook-react-rsbuild',
      })
    ).toBeUndefined();
  });

  it('refuses an unrelated anchor where no source module resolves, as v1 does', () => {
    const { repository } = givenSiblingPackages({
      ui: { badge: 'export const Badge = () => "ui";\n' },
    });
    const unrelated = path.join(repository, 'packages/empty');
    mkdirSync(unrelated, { recursive: true });

    // The default stats path sits under the unrelated root and owns no config directory, so this is
    // the predicate under test rather than the stats file's location.
    expect(
      anchorMismatchFor(VITE_STATS, {
        projectRoot: unrelated,
        builderName: '@storybook/react-vite',
      })
    ).toMatchObject({ subreason: 'unresolvedSourceModules' });
  });

  it('refuses an anchor witnessed only by the config directory, which every project has', () => {
    const { repository } = givenSiblingPackages({
      ui: { badge: 'export const Badge = () => "ui";\n' },
    });
    // A decoy root: it has the boilerplate `.storybook/preview.ts` every project has at the same
    // path, but none of the real source files the stats also name.
    const decoy = path.join(repository, 'packages/decoy');
    mkdirSync(path.join(decoy, '.storybook'), { recursive: true });
    writeFileSync(path.join(decoy, '.storybook/preview.ts'), 'export const parameters = {};\n');

    expect(
      anchorMismatchFor(VITE_STATS, {
        projectRoot: decoy,
        builderName: '@storybook/react-vite',
      })
    ).toMatchObject({ subreason: 'unresolvedSourceModules' });
  });

  it('refuses an anchor whose only matches are directories named like source files', () => {
    const { repository } = givenSiblingPackages({
      ui: { badge: 'export const Badge = () => "ui";\n' },
    });
    // Every source module the stats name resolves here, but each one lands on a directory. Reading
    // such a path throws EISDIR, so it is not evidence that the anchor owns those modules.
    const decoy = path.join(repository, 'packages/decoy');
    mkdirSync(path.join(decoy, 'src/lib/Badge/Badge.stories.tsx'), { recursive: true });
    mkdirSync(path.join(decoy, 'src/lib/Badge/Badge.tsx'), { recursive: true });

    expect(
      anchorMismatchFor(VITE_STATS, {
        projectRoot: decoy,
        builderName: '@storybook/react-vite',
      })
    ).toMatchObject({ subreason: 'unresolvedSourceModules' });
  });

  it('refuses an anchor where every source module is absolute-spelled and points elsewhere', () => {
    const { roots } = givenSiblingPackages({
      ui: { badge: 'export const Badge = () => "ui";\n' },
    });
    // Every name is absolute and lives under a different package entirely — none can resolve under
    // `ui`, so this must count as missing evidence rather than being discarded before counting.
    const otherPackage = path.join(roots.ui, '..', 'other-package');
    const absoluteStats = {
      modules: [
        { id: 1, name: path.join(otherPackage, 'src/lib/Badge/Badge.stories.tsx'), reasons: [] },
        {
          id: 2,
          name: path.join(otherPackage, 'src/lib/Badge/Badge.tsx'),
          reasons: [{ moduleName: path.join(otherPackage, 'src/lib/Badge/Badge.stories.tsx') }],
        },
      ],
    } as unknown as Stats;

    expect(
      anchorMismatchFor(absoluteStats, {
        projectRoot: roots.ui,
        builderName: '@storybook/react-webpack5',
      })
    ).toMatchObject({ subreason: 'unresolvedSourceModules' });
  });

  describe('modules bundled by concatenation', () => {
    // Webpack and rspack fold several real files into one module and expose them in `module.modules`.
    // The wrapper's own name is a synthetic label that resolves nowhere, so the anchor evidence lives
    // only on the children — a check that read the wrapper alone would see no source modules at all.
    const concatenatedStats = {
      modules: [
        {
          id: 1,
          name: './src/lib/Badge/Badge.stories.tsx + 1 modules',
          modules: [
            { name: './src/lib/Badge/Badge.stories.tsx' },
            { name: './src/lib/Badge/Badge.tsx' },
          ],
          reasons: [{ moduleName: './storybook-stories.js' }],
        },
      ],
    } as unknown as Stats;

    it('accepts an anchor witnessed only by a concatenated child', () => {
      const { roots } = givenSiblingPackages({
        ui: { badge: 'export const Badge = () => "ui";\n' },
      });

      expect(
        anchorMismatchFor(concatenatedStats, {
          projectRoot: roots.ui,
          builderName: '@storybook/react-webpack5',
        })
      ).toBeUndefined();
    });

    it('counts concatenated children as source modules when none of them resolve', () => {
      const { repository } = givenSiblingPackages({
        ui: { badge: 'export const Badge = () => "ui";\n' },
      });
      const unrelated = path.join(repository, 'packages/empty');
      mkdirSync(unrelated, { recursive: true });

      expect(
        anchorMismatchFor(concatenatedStats, {
          projectRoot: unrelated,
          builderName: '@storybook/react-webpack5',
        })
      ).toMatchObject({ subreason: 'unresolvedSourceModules' });
    });
  });
});

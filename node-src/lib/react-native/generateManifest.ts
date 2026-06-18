import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'url';

import { Deps } from '../../types';

type GenerateManifestDeps = Pick<Deps, 'options' | 'log'>;

interface GenerateManifestInput {
  sourceDir: string;
}

interface StoryIndex {
  entries: Record<string, StoryEntry>;
}

interface StoryEntry {
  type: 'story';
  id: string;
  name: string;
  importPath: string;
  title: string;
}

interface Story {
  storyId: string;
  name: string;
  fileName: string;
  component: {
    name: string;
    csfId: string;
    displayName: string;
    path: string[];
  };
}

/**
 * Builds a story manifest for React Native Storybook and writes it to manifest.json in the source directory.
 *
 * @param deps - Cross-cutting dependencies (options and logger).
 * @param input - The source directory the manifest is written to.
 */
export async function generateManifest(deps: GenerateManifestDeps, input: GenerateManifestInput) {
  const index = await buildStoryIndex(deps);
  const { stories, entries } = parseStoryIndex(deps, index);
  writeManifest(deps, input.sourceDir, JSON.stringify({ stories, json: entries }, undefined, 2));
}

async function buildStoryIndex(deps: GenerateManifestDeps): Promise<StoryIndex> {
  const configPath = deps.options.storybookConfigDir ?? '.rnstorybook';
  const fullConfigPath = path.join(process.cwd(), configPath);

  if (!existsSync(fullConfigPath)) {
    throw new Error(
      `React Native Storybook config directory not found at "${fullConfigPath}". Please specify the correct path with --storybook-config-dir.`
    );
  }
  // Create require relative to user's project, not the bundled CLI location
  const require = createRequire(path.join(process.cwd(), 'package.json'));

  try {
    // Storybook 10+ (ESM-only)
    const modulePath = require.resolve('@storybook/react-native/node');

    const { buildIndex } = await import(pathToFileURL(modulePath).href);
    return buildIndex({ configPath });
  } catch {
    // Storybook 9
    const { buildIndex } = require('storybook/internal/core-server');
    return buildIndex({ configDir: configPath });
  }
}

function parseStoryIndex(
  deps: GenerateManifestDeps,
  index: StoryIndex
): { stories: Story[]; entries: StoryEntry[] } {
  deps.log.debug('Building story manifest');

  const entries = Object.values(index.entries).filter((entry) => entry.type === 'story');
  const stories = entries.map((entry) => ({
    storyId: entry.id,
    name: entry.name,
    fileName: entry.importPath,
    component: {
      name: entry.title,
      csfId: entry.id.replace(/--.+$/, ''),
      displayName: entry.title.split('/').at(-1) ?? '',
      path: entry.title.split('/'),
    },
  }));

  deps.log.debug(`Found ${stories.length} stories`);
  return { stories, entries };
}

function writeManifest(deps: GenerateManifestDeps, sourceDirectory: string, storyData: string) {
  const outputFile = path.resolve(sourceDirectory, 'manifest.json');
  deps.log.debug(`Writing manifest to file at "${outputFile}"`);

  mkdirSync(sourceDirectory, { recursive: true });
  writeFileSync(outputFile, storyData);

  deps.log.debug('Manifest generation complete');
}

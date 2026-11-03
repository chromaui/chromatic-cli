import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import picomatch from 'picomatch';
import { pathToFileURL } from 'url';

import { Deps } from '../../types';
import { exitCodes, TaskFailure } from '../setExitCode';

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

  const storyEntries = Object.values(index.entries).filter((entry) => entry.type === 'story');
  const entries = excludeStories(deps, storyEntries);
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

function excludeStories(deps: GenerateManifestDeps, entries: StoryEntry[]): StoryEntry[] {
  const excludeStoryIds = deps.options.reactNative?.excludeStoryIds ?? [];
  if (excludeStoryIds.length === 0) return entries;

  const matchers = excludeStoryIds.map((glob) => ({ glob, isMatch: picomatch(glob) }));
  const matchedGlobs = new Set<string>();
  const keptEntries = entries.filter((entry) => {
    const matching = matchers.filter(({ isMatch }) => isMatch(entry.id));
    for (const { glob } of matching) matchedGlobs.add(glob);
    return matching.length === 0;
  });

  const unmatchedGlobs = excludeStoryIds.filter((glob) => !matchedGlobs.has(glob));
  if (unmatchedGlobs.length > 0) {
    deps.log.warn(
      `reactNative.excludeStoryIds patterns matched no stories: ${unmatchedGlobs.join(', ')}`
    );
  }

  deps.log.debug(`Excluded ${entries.length - keptEntries.length} stories with excludeStoryIds`);

  if (entries.length > 0 && keptEntries.length === 0) {
    // User errors skip the fatal error output, so log the explanation where every renderer shows it.
    deps.log.error(
      'Every story was removed by reactNative.excludeStoryIds, so there is nothing to test. Remove some patterns from excludeStoryIds in your Chromatic config file.'
    );
    throw new TaskFailure('All stories were excluded by reactNative.excludeStoryIds', {
      exitCode: exitCodes.BUILD_NO_STORIES,
      userError: true,
    });
  }

  return keptEntries;
}

function writeManifest(deps: GenerateManifestDeps, sourceDirectory: string, storyData: string) {
  const outputFile = path.resolve(sourceDirectory, 'manifest.json');
  deps.log.debug(`Writing manifest to file at "${outputFile}"`);

  mkdirSync(sourceDirectory, { recursive: true });
  writeFileSync(outputFile, storyData);

  deps.log.debug('Manifest generation complete');
}

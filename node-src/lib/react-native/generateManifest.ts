import { mkdirSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

import { Context } from '../../types';

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
 * @param ctx - Build context with options and source directory
 */
export async function generateManifest(ctx: Context) {
  const index = await buildStoryIndex(ctx);
  const { stories, entries } = parseStoryIndex(ctx, index);
  // eslint-disable-next-line unicorn/no-null
  writeManifest(ctx, JSON.stringify({ stories, json: entries }, null, 2));
}

async function buildStoryIndex(ctx: Context): Promise<StoryIndex> {
  const configPath = ctx.options.storybookConfigDir ?? '.rnstorybook';

  try {
    // Storybook 10+
    // @ts-expect-error - optional peer @storybook/react-native
    const { buildIndex } = await import('@storybook/react-native/node');
    return buildIndex({ configPath });
  } catch {
    // Storybook 9
    const require = createRequire(import.meta.url);

    const { buildIndex } = await require('storybook/internal/core-server');
    return buildIndex({ configDir: configPath });
  }
}

function parseStoryIndex(
  ctx: Context,
  index: StoryIndex
): { stories: Story[]; entries: StoryEntry[] } {
  ctx.log.debug('Building story manifest');

  const entries = Object.values(index.entries).filter((entry) => entry.type === 'story');

  const stories: Story[] = [];
  for (const entry of entries) {
    stories.push({
      storyId: entry.id,
      name: entry.name,
      fileName: entry.importPath,
      component: {
        name: entry.title,
        csfId: entry.id.replace(/--.+$/, ''),
        displayName: entry.title.split('/').at(-1) ?? '',
        path: entry.title.split('/'),
      },
    });
  }

  ctx.log.debug(`Found ${stories.length} stories.`);
  return { stories, entries };
}

function writeManifest(ctx: Context, storyData: string) {
  const outputFile = path.resolve(ctx.options.storybookBuildDir, 'manifest.json');
  ctx.log.debug(`Writing manifest to file at "${outputFile}"`);

  mkdirSync(ctx.sourceDir, { recursive: true });
  writeFileSync(outputFile, storyData);

  ctx.log.debug('Manifest generation complete');
}

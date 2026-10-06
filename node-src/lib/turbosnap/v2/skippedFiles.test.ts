import { describe, expect, it } from 'vitest';

import { InMemoryDisk, inMemoryProjectFiles } from './projectFiles.fake';
import { findSkippedFiles } from './skippedFiles';

const projectRoot = '/repo/packages/ui';
const configDirectory = `${projectRoot}/.storybook`;
const generated = `${projectRoot}/src/generated/schema.ts`;
const source = `${projectRoot}/src/Button.tsx`;
const installed = `${projectRoot}/node_modules/react/index.js`;
const preview = `${configDirectory}/preview.ts`;

function context(disk: InMemoryDisk) {
  return { projectRoot, configDir: configDirectory, projectFiles: inMemoryProjectFiles(disk) };
}

describe('findSkippedFiles', () => {
  it('skips the files git ignores', async () => {
    const skipped = await findSkippedFiles(
      [generated, source],
      context({ isIgnored: (candidate) => candidate === generated })
    );

    expect([...skipped]).toEqual([generated]);
  });

  it('never skips a node_modules file, however git sees it', async () => {
    const skipped = await findSkippedFiles([installed, source], context({ isIgnored: () => true }));

    expect([...skipped]).toEqual([source]);
  });

  it('never skips a file in the Storybook config directory, however git sees it', async () => {
    const skipped = await findSkippedFiles([preview, source], context({ isIgnored: () => true }));

    expect([...skipped]).toEqual([source]);
  });

  it("never skips another package's file under the project root, since a workspace package's build output is a dependency", async () => {
    const built = `${projectRoot}/packages/icons/dist/index.js`;

    const skipped = await findSkippedFiles(
      [built, generated],
      context({
        directories: { [`${projectRoot}/packages/icons`]: ['package.json'] },
        isIgnored: () => true,
      })
    );

    expect([...skipped]).toEqual([generated]);
  });

  it('never skips a file outside the project root, since it cannot be one of the project’s own', async () => {
    const built = '/repo/packages/icons/dist/index.js';

    const skipped = await findSkippedFiles([built, generated], context({ isIgnored: () => true }));

    expect([...skipped]).toEqual([generated]);
  });

  it('judges every rule by where a file really lives, since a bundler names files by real path while the project is named as configured', async () => {
    const linkedRoot = '/repo/apps/web';
    const projectFiles = {
      ...inMemoryProjectFiles({
        isIgnored: (candidate) => candidate === generated,
      }),
      realPath: (absolutePath: string) => absolutePath.replace(linkedRoot, projectRoot),
    };
    const linkedGenerated = generated.replace(projectRoot, linkedRoot);
    const linkedPreview = preview.replace(projectRoot, linkedRoot);

    const skipped = await findSkippedFiles([linkedGenerated, linkedPreview, source], {
      projectRoot: linkedRoot,
      configDir: `${linkedRoot}/.storybook`,
      projectFiles,
    });

    expect([...skipped]).toEqual([linkedGenerated]);
  });

  it('asks git by real path and answers by the path it was given', async () => {
    const asked: string[] = [];
    const projectFiles = {
      ...inMemoryProjectFiles({}),
      realPath: (absolutePath: string) => absolutePath.replace('/repo/apps/web', projectRoot),
      ignoredFiles: async (absolutePaths: string[]) => {
        asked.push(...absolutePaths);
        return new Set(absolutePaths);
      },
    };
    const linked = generated.replace(projectRoot, '/repo/apps/web');

    const skipped = await findSkippedFiles([linked], {
      projectRoot,
      configDir: configDirectory,
      projectFiles,
    });

    expect(asked).toEqual([generated]);
    expect([...skipped]).toEqual([linked]);
  });
});

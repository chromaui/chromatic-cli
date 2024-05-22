import mockfs from 'mock-fs';
import { afterEach, describe, expect, it } from 'vitest';

import { readStatsFile } from '../node-src/tasks/read-stats-file';
import * as trimmedFile from './__mocks__/previewStatsJson/preview-stats.trimmed.json';

mockfs({
  './storybook-static/preview-stats.json': JSON.stringify(trimmedFile),
});

afterEach(() => {
  mockfs.restore();
});

describe('Trim Stats File', () => {
  it('readStatsFile returns expected output', async () => {
    const result = await readStatsFile('./storybook-static/preview-stats.json');
    expect(result.modules.some(({ id }) => id === './node-src/ui/components/icons.stories.ts')).toBe(
      true
    );
  });
});

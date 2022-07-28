/* eslint-disable prettier/prettier */
import mockfs from 'mock-fs'

import { readStatsFile } from './trim-stats-file';
// eslint-disable-next-line jest/no-mocks-import
import * as trimmedFile from './__mocks__/previewStatsJson/preview-stats.trimmed.json';

mockfs({
    './storybook-static/preview-stats.json': JSON.stringify(trimmedFile),
})

afterEach(() => {
    mockfs.restore();
})

describe('Trim Stats File', () => {
    it('readStatsFile returns expected output', async () => {
        const result = await readStatsFile('./storybook-static/preview-stats.json');
        expect(result.modules.some(({ id }) => id === './bin-src/ui/components/icons.stories.ts')).toBe(true);
    });
});

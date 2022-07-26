/* eslint-disable prettier/prettier */
import { execSync } from 'child_process';
import { main } from './trim-stats-file';
// eslint-disable-next-line jest/no-mocks-import
import * as trimmedStats from './__mocks__/previewStatsJson/preview-stats.trimmed.json';
// eslint-disable-next-line jest/no-mocks-import
import * as baseTrimmedStats from './__mocks__/previewStatsJson/baseline-preview-stats.trimmed.json';

describe('Trim Stats File', () => {
    it('returns expected file output', async () => {
        execSync('yarn build-storybook --webpack-stats-json', { encoding: 'utf-8' });
        execSync('npx chromatic trim-stats-file', { encoding: 'utf-8' });
        await main(['./storybook-static/preview-stats.json']);
        execSync('mv ../storybook-static/preview-stats.trimmed.json ./__mocks__/previewStatsJson', { encoding: 'utf-8' });
        expect(baseTrimmedStats).toEqual(trimmedStats);
    });
});

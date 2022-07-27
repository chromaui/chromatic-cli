/* eslint-disable prettier/prettier */
import * as fs from 'fs-extra';
import { main } from './trim-stats-file';
// eslint-disable-next-line jest/no-mocks-import
import * as baseTrimmedStats from './__mocks__/previewStatsJson/preview-stats.trimmed.json';

jest.mock('fs-extra');
jest.mock('../storybook-static/preview-stats.json', () => {
    return './__mocks__/previewStatsJson/preview-stats.json';
});

const file = jest.spyOn(fs, 'outputFile');

describe('Trim Stats File', () => {
    it('returns expected file output', async () => {
        await main(['../storybook-static/preview-stats.json']);
        expect(file).toHaveBeenCalledWith(baseTrimmedStats);
    });
});

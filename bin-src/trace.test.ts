import mockfs from 'mock-fs';

// eslint-disable-next-line jest/no-mocks-import
import * as trimmedFile from './__mocks__/previewStatsJson/preview-stats.trimmed.json';

mockfs({
  './storybook-static/preview-stats.json': JSON.stringify(trimmedFile),
});

afterEach(() => {
  mockfs.restore();
});

describe('Trace', () => {
  it('acts as a placeholder for a trace test', async () => {
    expect(true).toBe(true);
  });
});

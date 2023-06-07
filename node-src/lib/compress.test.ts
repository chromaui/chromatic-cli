import mockFs from 'mock-fs';
import fs from 'fs-extra';
import makeZipFile from './compress';
import TestLogger from './testLogger';

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  mockFs.restore();
});

const testContext = {
  sourceDir: '/chromatic-tmp',
  fileInfo: { paths: ['file1'] },
  log: new TestLogger(),
} as any;

describe('makeZipFile', () => {
  it('adds files to an archive', async () => {
    mockFs({
      '/chromatic-tmp': {
        file1: 'Storybook',
      },
    });

    const result = await makeZipFile(testContext);

    expect(fs.existsSync(result.path)).toBeTruthy();
    expect(result.size).toBeGreaterThan(0);
  });

  it('rejects on error signals', () => {
    return expect(makeZipFile(testContext)).rejects.toThrow(
      `ENOENT: no such file or directory, open '/chromatic-tmp/file1'`
    );
  });
});

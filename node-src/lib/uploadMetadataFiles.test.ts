import { afterEach, describe, expect, it, vi } from 'vitest';

import TestLogger from './testLogger';
import { uploadFiles } from './uploadFiles';
import { uploadMetadataFiles } from './uploadMetadataFiles';

vi.mock('./getStorybookMetadata', () => ({
  findStorybookConfigFile: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('./uploadFiles', () => ({
  uploadFiles: vi.fn().mockResolvedValue(undefined),
}));

const stubFs = {
  stat: vi.fn(async () => ({ size: 100, isFile: () => true, isDirectory: () => false })),
  writeFile: vi.fn(async () => {}),
  mkstemp: vi.fn(async () => ({ path: '/tmp/metadata.html', cleanup: async () => {} })),
};

describe('uploadMetadataFiles', () => {
  const log = new TestLogger();
  const baseContext = {
    log,
    options: {},
    ports: { fs: stubFs } as any,
  } as any;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should skip upload if no build announced', async () => {
    await uploadMetadataFiles(baseContext);
    expect(uploadFiles).not.toHaveBeenCalled();
  });

  it('should skip if there are no metadata files to upload', async () => {
    await uploadMetadataFiles({ ...baseContext, announcedBuild: { id: '1' } });
    expect(uploadFiles).not.toHaveBeenCalled();
  });

  it('should upload metadata files', async () => {
    const mockLogFileTarget = {
      contentLength: 100,
      filePath: 'chromatic.log',
      formAction: 'https://s3.amazonaws.com',
      formFields: {},
      localPath: 'chromatic.log',
    };

    const ctx = {
      ...baseContext,
      options: {
        logFile: mockLogFileTarget.localPath,
      },
      announcedBuild: { id: '1' },
      build: { storybookUrl: 'https://sample-storybook.dev-chromatic.com' },
      ports: {
        fs: stubFs,
        chromatic: {
          uploadMetadata: vi.fn().mockResolvedValue({
            info: {
              targets: [mockLogFileTarget],
            },
            userErrors: [],
          }),
        },
      },
    } as any;

    await uploadMetadataFiles(ctx);

    expect(uploadFiles).toHaveBeenCalledWith(ctx, expect.arrayContaining([mockLogFileTarget]));

    // Ensure that the log pause is called before calculating the file size and after upload.
    const logPauseCallOrder = ctx.log.pause.mock.invocationCallOrder[0];
    const uploadFilesCallOrder = vi.mocked(uploadFiles).mock.invocationCallOrder[0];
    const logResumeCallOrder = ctx.log.resume.mock.invocationCallOrder[0];

    expect(logPauseCallOrder).toBeLessThan(uploadFilesCallOrder);
    expect(logResumeCallOrder).toBeGreaterThan(uploadFilesCallOrder);
  });
});

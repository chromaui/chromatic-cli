import jsonfile from 'jsonfile';
import { describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import { writeChromaticDiagnostics } from '../lib/writeChromaticDiagnostics';
import { Context } from '../types';
import { applyUploadPartial } from './upload';

vi.mock('jsonfile');
vi.mock('fs');

const createContext = () =>
  ({
    build: { id: 'build-id', changeCount: 2 },
    log: new TestLogger(),
    options: { diagnosticsFile: 'chromatic-diagnostics.json' },
  }) as unknown as Context;

// Returns what the diagnostics file holds after writeChromaticDiagnostics.
const writtenDiagnostics = async (ctx: Context) => {
  await writeChromaticDiagnostics(ctx);
  // jsonfile writes JSON, which drops undefined fields.
  const fileContents = JSON.stringify(vi.mocked(jsonfile.writeFile).mock.lastCall?.[1]);
  return JSON.parse(fileContents);
};

describe('diagnostics after a TurboSnap skip', () => {
  it.each(['PENDING', 'PASSED', 'ACCEPTED', 'DENIED'])(
    'retains the %s ancestor result alongside skipped-build counts',
    async (status) => {
      const ctx = createContext();
      const ancestorBuild = {
        status,
        webUrl: 'https://example.com/build?number=1',
        snapshotCount: 10,
      };

      applyUploadPartial(ctx, {
        sentinelUrls: [],
        uploadedBytes: 0,
        uploadedFiles: 0,
        skippedByTurboSnap: true,
        skippedBuild: { changeCount: 0 },
        ancestorBuild,
      });

      expect(await writtenDiagnostics(ctx)).toMatchObject({
        ancestorBuild,
        build: { id: 'build-id', changeCount: 0 },
      });
    }
  );

  it('omits ancestorBuild when the server did not return an ancestor', async () => {
    const ctx = createContext();

    applyUploadPartial(ctx, {
      sentinelUrls: [],
      uploadedBytes: 0,
      uploadedFiles: 0,
      skippedByTurboSnap: true,
    });

    expect(await writtenDiagnostics(ctx)).not.toHaveProperty('ancestorBuild');
  });
});

import { describe, expect, it } from 'vitest';

import { getDiagnostics } from '../lib/writeChromaticDiagnostics';
import { Context } from '../types';
import { applyUploadPartial } from './upload';

const createContext = () =>
  ({
    build: { id: 'build-id', changeCount: 2 },
    options: {},
  }) as Context;

describe('diagnostics after a TurboSnap skip', () => {
  it.each(['PENDING', 'PASSED', 'ACCEPTED', 'DENIED'])(
    'retains the %s ancestor result alongside skipped-build counts',
    (status) => {
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

      const serializedDiagnostics = JSON.stringify(getDiagnostics(ctx));
      expect(JSON.parse(serializedDiagnostics)).toMatchObject({
        ancestorBuild,
        build: { id: 'build-id', changeCount: 0 },
      });
    }
  );

  it('omits ancestorBuild when the server did not return an ancestor', () => {
    const ctx = createContext();

    applyUploadPartial(ctx, {
      sentinelUrls: [],
      uploadedBytes: 0,
      uploadedFiles: 0,
      skippedByTurboSnap: true,
    });

    const serializedDiagnostics = JSON.stringify(getDiagnostics(ctx));
    expect(JSON.parse(serializedDiagnostics)).not.toHaveProperty('ancestorBuild');
  });
});

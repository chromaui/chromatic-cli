import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { main } from './trace';

afterEach(() => {
  vi.restoreAllMocks();
});

// Call main() in-process rather than spawning `yarn chromatic trace`, which runs dist/bin.cjs:
// that build is missing on a fresh checkout and stale after a source change, so a spawned
// test either fails for no reason or passes against old code.
const rootDirectoryNote = 'The root directory of your project:';

async function trace(args: string[]) {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  await main([...args, '-s', 'bin-src/__mocks__/previewStatsJson/preview-stats.trimmed.json']);
  return info.mock.calls.flat().join('\n');
}

describe('chromatic trace', () => {
  it('returns the default output successfully', async () => {
    const output = await trace(['./node-src/ui/messages/errors/invalidReportPath.ts']);

    expect(output).toContain('Traced 1 changed file to 1 affected story file');
    expect(output).not.toContain(rootDirectoryNote);
  });

  it('traces absolute changed file paths the same as repository-relative ones', async () => {
    const output = await trace([
      path.join(process.cwd(), 'node-src/ui/messages/errors/invalidReportPath.ts'),
    ]);

    expect(output).toContain('Traced 1 changed file to 1 affected story file');
  });

  it('outputs directory info when -m expanded is passed', async () => {
    const output = await trace([
      './node-src/ui/messages/errors/invalidReportPath.ts',
      '-m',
      'expanded',
    ]);

    expect(output).toContain(rootDirectoryNote);
    expect(output).toContain('The base directory (The relative path from the root');
    expect(output).toContain('The storybook directory (The directory can either be');
    expect(output).toContain('If you are having trouble with tracing');
    expect(output).toContain('node-src/ui/messages/errors/invalidReportPath.stories.ts');
    expect(output).toContain('node-src/ui/messages/errors/invalidReportPath.ts');
  });

  it('outputs untraced info when --mode expanded is passed with -u and an untraced file', async () => {
    const output = await trace([
      './node-src/ui/messages/errors/invalidReportPath.ts',
      '-m',
      'expanded',
      '-u',
      './node-src/ui/messages/errors/invalidReportPath.ts',
    ]);

    expect(output).toContain('We detected some untraced files');
    expect(output).toContain('node-src/ui/messages/errors/invalidReportPath.ts');
  });
});

import { execSync } from 'child_process';
import { describe, expect, it } from 'vitest';

import {
  baseDirectoryNote,
  rootDirectoryNote,
  storybookDirectoryNote,
  traceSuggestions,
} from '../node-src/ui/messages/info/tracedAffectedFiles';

describe('Test trace script from package.json', () => {
  it('returns the default output successfully', () => {
    const scriptName =
      'chromatic trace ./node-src/ui/messages/errors/invalidReportPath.ts -s bin-src/__mocks__/previewStatsJson/preview-stats.trimmed.json';

    // Execute the script as a child process
    const output = execSync(`yarn ${scriptName}`).toString().trim();

    // Verify that the output does not contain the expanded output
    expect(output).not.toContain(rootDirectoryNote);
  });
  it('outputs directory info when -m expanded is passed', () => {
    const scriptName =
      "chromatic trace ./node-src/ui/messages/errors/invalidReportPath.ts -s bin-src/__mocks__/previewStatsJson/preview-stats.trimmed.json -m 'expanded'";

    // Execute the script as a child process
    const output = execSync(`yarn ${scriptName}`).toString().trim();

    const expandedStoryModule = `node-src/ui/messages/errors/invalidReportPath.stories.ts`;
    const expandedFileModule = `node-src/ui/messages/errors/invalidReportPath.ts`;

    // Add your assertions based on the expected output or behavior of the script
    expect(output).toContain(rootDirectoryNote);
    expect(output).toContain(baseDirectoryNote);
    expect(output).toContain(storybookDirectoryNote);
    expect(output).toContain(traceSuggestions);
    expect(output).toContain(expandedStoryModule);
    expect(output).toContain(expandedFileModule);
  });
  it('outputs untraced info when --mode expanded is passed with -u and an untraced file', () => {
    const scriptName =
      "chromatic trace ./node-src/ui/messages/errors/invalidReportPath.ts -s bin-src/__mocks__/previewStatsJson/preview-stats.trimmed.json -m expanded -u './node-src/ui/messages/errors/invalidReportPath.ts'";

    // Execute the script as a child process
    const output = execSync(`yarn ${scriptName}`).toString().trim();

    const untracedFile = `node-src/ui/messages/errors/invalidReportPath.ts`;
    const untracedFileNote = `We detected some untraced files`;

    expect(output).toContain(untracedFileNote);
    expect(output).toContain(untracedFile);
  });
});

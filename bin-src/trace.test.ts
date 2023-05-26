import chalk from 'chalk';
import { execSync } from 'child_process';

import {
  rootDirNote,
  baseDirNote,
  storybookDirNote,
  traceSuggestions,
} from './ui/messages/info/tracedAffectedFiles';

const scriptCommand = `$ ./bin/main.cjs trace ./bin-src/ui/messages/errors/invalidReportPath.ts`;
const tracedBegin = `Traced 1 changed file to 1 affected story file`;
const moduleName = `bin-src/ui/messages/errors/invalidReportPath.stories.ts`;

describe('Test trace script from package.json', () => {
  it('returns the default output successfully', () => {
    const scriptName =
      'chromatic trace ./bin-src/ui/messages/errors/invalidReportPath.ts -s bin-src/__mocks__/previewStatsJson/preview-stats.trimmed.json';

    // Execute the script as a child process
    const output = execSync(`yarn ${scriptName}`).toString().trim();

    // Add your assertions based on the expected output or behavior of the script
    expect(output).toContain(scriptCommand);
    expect(output).toContain(tracedBegin);
    expect(output).toContain(moduleName);

    // Verify that the output does not contain the expanded output
    expect(output).not.toContain(rootDirNote);
  });
  it('outputs directory info when -m expanded is passed', () => {
    const scriptName =
      'chromatic trace ./bin-src/ui/messages/errors/invalidReportPath.ts -s bin-src/__mocks__/previewStatsJson/preview-stats.trimmed.json -m expanded';

    // Execute the script as a child process
    const output = execSync(`yarn ${scriptName}`).toString().trim();

    const expandedStoryModule = `bin-src/ui/messages/errors/invalidReportPath.stories.ts`;
    const expandedFileModule = `bin-src/ui/messages/errors/invalidReportPath.ts`;

    // Add your assertions based on the expected output or behavior of the script
    expect(output).toContain(rootDirNote);
    expect(output).toContain(baseDirNote);
    expect(output).toContain(storybookDirNote);
    expect(output).toContain(traceSuggestions);
    expect(output).toContain(expandedStoryModule);
    expect(output).toContain(expandedFileModule);
  });
  it('outputs untraced info when --mode expanded is passed with -u and an untraced file', () => {
    const scriptName =
      'chromatic trace ./bin-src/ui/messages/errors/invalidReportPath.ts -s bin-src/__mocks__/previewStatsJson/preview-stats.trimmed.json -m expanded -u ./bin-src/ui/messages/errors/invalidReportPath.ts';

    // Execute the script as a child process
    const output = execSync(`yarn ${scriptName}`).toString().trim();

    const untracedFile = `./bin-src/ui/messages/errors/invalidReportPath.ts`;
    const untracedFileNote = `We detected some untraced files`;

    expect(output).toContain(untracedFileNote);
    expect(output).toContain(untracedFile);
  });
});

import chalk from 'chalk';
import { execSync } from 'child_process';

const scriptCommand = `$ ./bin/main.cjs trace ./bin-src/ui/messages/errors/invalidRepositorySlug.ts`;
const tracedBegin = `Traced ${chalk`{bold 1 changed file}`} to ${chalk`{bold 1 affected story file}`}`;
const moduleName = `bin-src/ui/messages/errors/${chalk`{bold invalidRepositorySlug.stories.ts}`}`;
const storyIndex = `[story index]`;
const tracedEnd = `Set ${chalk`{bold --mode (-m)}`} to ${chalk`{bold 'expanded'}`} to reveal underlying modules.`;

const rootDirNote = `The root directory of your project:`;

describe('Test trace script from package.json', () => {
  it('returns the default output successfully', () => {
    const scriptName = 'chromatic trace ./bin-src/ui/messages/errors/invalidRepositorySlug.ts';

    // Execute the script as a child process
    const output = execSync(`yarn ${scriptName}`).toString().trim();

    // Add your assertions based on the expected output or behavior of the script
    expect(output).toContain(scriptCommand);
    expect(output).toContain(tracedBegin);
    expect(output).toContain(moduleName);
    expect(output).toContain(storyIndex);
    expect(output).toContain(tracedEnd);

    // Verify that the output does not contain the expanded output
    expect(output).not.toContain(rootDirNote);
  });
  it('outputs directory info when -m expanded is passed', () => {
    const scriptName =
      'chromatic trace ./bin-src/ui/messages/errors/invalidRepositorySlug.ts -m expanded';

    // Execute the script as a child process
    const output = execSync(`yarn ${scriptName}`).toString().trim();

    const baseDirNote = `The base directory (The relative path from the root to the storybook config root):`;
    const storybookDirNote = `The storybook directory (The directory can either be at the root or in a sub-directory):`;
    const traceSuggestions = `If you are having trouble with tracing, please check the following:\n
  1. Make sure you have the correct root path, base path, and storybook path.\n
  2. Make sure you have the correct storybook config file.\n
  3. Make sure you have the correct storybook config file path.\nYou can either set the flags storybook-base-dir or storybook-config-dir to help TurboSnap find the correct storybook config file.\n`;
    const expandedStoryModule = `bin-src/ui/messages/errors/invalidRepositorySlug.stories.ts`;
    const expandedFileModule = `bin-src/ui/messages/errors/invalidRepositorySlug.ts`;

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
      'chromatic trace ./bin-src/ui/messages/errors/invalidRepositorySlug.ts -m expanded -u ./bin-src/ui/messages/errors/invalidRepositorySlug.ts';

    // Execute the script as a child process
    const output = execSync(`yarn ${scriptName}`).toString().trim();

    const untracedFile = `./bin-src/ui/messages/errors/invalidRepositorySlug.ts`;
    const untracedFileNote = `We detected some untraced files`;

    expect(output).toContain(untracedFileNote);
    expect(output).toContain(untracedFile);
  });
});

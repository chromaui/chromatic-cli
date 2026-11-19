import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// What Storybook writes for Yarn Plug'n'Play and monorepo projects. The CLI can't evaluate a
// main.ts, so it reads the name out of the call.
function getAbsolutePath(value: string): any {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

export default { framework: { name: getAbsolutePath('@storybook/html-vite'), options: {} } };

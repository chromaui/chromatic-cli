const fs = require('node:fs');
const path = require('node:path');

const outputDirectory = process.argv[2];
if (!outputDirectory) {
  throw new Error('Usage: node verify-storybook.cjs <storybook-directory>');
}

for (const fileName of [
  'index.html',
  'iframe.html',
  'index.json',
  'project.json',
  'preview-stats.json',
]) {
  const filePath = path.join(outputDirectory, fileName);
  const file = fs.statSync(filePath);
  if (!file.isFile() || file.size === 0) {
    throw new Error(`Expected a non-empty Storybook file at ${filePath}`);
  }
}

const index = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'index.json'), 'utf8'));
if (!index.entries || Object.keys(index.entries).length === 0) {
  throw new Error('Expected index.json to contain at least one story entry');
}

const project = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'project.json'), 'utf8'));
if (!project.storybookVersion) {
  throw new Error('Expected project.json to contain storybookVersion');
}

const stats = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'preview-stats.json'), 'utf8'));
if (!Array.isArray(stats.modules) || stats.modules.length === 0) {
  throw new Error('Expected preview-stats.json to contain modules for TurboSnap tracing');
}

const absoluteModulePaths = stats.modules
  .map((module) => module.name || module.id)
  .filter(
    (modulePath) =>
      typeof modulePath === 'string' &&
      !modulePath.startsWith('/virtual:') &&
      (modulePath.startsWith('/') ||
        /^[A-Za-z]:[\\/]/.test(modulePath) ||
        modulePath.startsWith('\\\\'))
  );
if (absoluteModulePaths.length > 0) {
  throw new Error(
    `Expected TurboSnap module paths to be portable between the container and checkout; found ${absoluteModulePaths[0]}`
  );
}

const entryCount = Object.keys(index.entries).length;
console.log(
  `Verified Storybook ${project.storybookVersion}: ${entryCount} entries, ${stats.modules.length} modules`
);

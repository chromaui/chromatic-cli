import { defineConfig } from 'tsdown';

// Keep class names through minification. Dependencies such as execa and node-fetch name their
// errors after their class (`error.name`), and Sentry titles issues by it, so mangled class names
// made unreadable titles that changed whenever the bundle layout did. Function names are still
// mangled: keeping them too would grow the bundle by about 9%, this by under 1%. `compress` needs
// it as well as `mangle`, or the compressor turns some named classes into anonymous ones.
const keepClassNames = { function: false, class: true };

export default defineConfig((options) => [
  {
    entry: {
      bin: 'bin-src/register.js',
      node: 'node-src/index.ts',
    },
    splitting: true,
    minify: !options.watch && {
      compress: { keepNames: keepClassNames },
      mangle: { keepNames: keepClassNames },
    },
    format: ['cjs'],
    treeshake: true,
    sourcemap: true,
    clean: true,
    platform: 'node',
    shims: true, // Make `import.meta.url` work in CJS output (meow uses it to find package.json)
    target: 'node20', // Lowest supported Node version
    env: {
      SENTRY_ENVIRONMENT: process.env.CI ? 'production' : 'development',
      SENTRY_RELEASE: process.env.SENTRY_RELEASE || 'development',
      SENTRY_DIST: 'cli',
    },
    dts: {
      entry: 'node-src/index.ts',
    },
  },
  {
    entry: ['action-src/register.js'],
    outDir: 'action',
    splitting: false,
    minify: !options.watch && {
      compress: { keepNames: keepClassNames },
      mangle: { keepNames: keepClassNames },
    },
    format: ['cjs'],
    treeshake: true,
    sourcemap: true,
    clean: true,
    platform: 'node',
    shims: true, // Make `import.meta.url` work in CJS output (meow uses it to find package.json)
    target: 'node20', // Lowest supported Node version
    external: ['semver'],
    env: {
      SENTRY_ENVIRONMENT: process.env.CI ? 'production' : 'development',
      SENTRY_RELEASE: process.env.SENTRY_RELEASE || 'development',
      SENTRY_DIST: 'action',
    },
  },
]);

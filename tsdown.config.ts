import { defineConfig } from 'tsdown';

export default defineConfig((options) => [
  {
    entry: {
      bin: 'bin-src/register.js',
      node: 'node-src/index.ts',
    },
    splitting: true,
    minify: !options.watch,
    format: ['cjs'],
    treeshake: true,
    sourcemap: true,
    clean: true,
    platform: 'node',
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
    entry: { 'clack-prototype': 'node-src/clack-prototype/bin.ts' } as Record<string, string>,
    outDir: 'dist',
    minify: false,
    format: ['esm'],
    treeshake: true,
    sourcemap: true,
    clean: false,
    platform: 'node',
    target: 'node20',
    shims: true,
    external: ['snyk-nodejs-plugin', 'snyk-nodejs-lockfile-parser'],
  },
  {
    entry: ['action-src/register.js'],
    outDir: 'action',
    splitting: false,
    minify: !options.watch,
    format: ['cjs'],
    treeshake: true,
    sourcemap: true,
    clean: true,
    platform: 'node',
    target: 'node20', // Lowest supported Node version
    external: ['semver'],
    env: {
      SENTRY_ENVIRONMENT: process.env.CI ? 'production' : 'development',
      SENTRY_RELEASE: process.env.SENTRY_RELEASE || 'development',
      SENTRY_DIST: 'action',
    },
  },
]);

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
    env: {
      SENTRY_ENVIRONMENT: process.env.CI ? 'production' : 'development',
      SENTRY_RELEASE: process.env.SENTRY_RELEASE || 'development',
      SENTRY_DIST: 'action',
    },
  },
]);

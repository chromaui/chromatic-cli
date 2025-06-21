import { defineConfig } from 'tsup';

export default defineConfig((options) => [
  {
    entry: {
      bin: 'bin-src/register.js',
      node: 'node-src/index.ts',
    },
    splitting: true,
    minify: !options.watch,
    format: ['cjs'],
    dts: {
      entry: { node: 'node-src/index.ts' },
      resolve: true,
    },
    treeshake: true,
    sourcemap: true,
    clean: true,
    platform: 'node',
    external: ['prettier'],
    target: 'node16', // Storybook still supports Node 16
    env: {
      SENTRY_ENVIRONMENT: process.env.CI ? 'production' : 'development',
      SENTRY_RELEASE: process.env.SENTRY_RELEASE || 'development',
      SENTRY_DIST: 'cli',
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
    target: 'node20', // Sync with `runs.using` in action.yml
    env: {
      SENTRY_ENVIRONMENT: process.env.CI ? 'production' : 'development',
      SENTRY_RELEASE: process.env.SENTRY_RELEASE || 'development',
      SENTRY_DIST: 'action',
    },
  },
]);

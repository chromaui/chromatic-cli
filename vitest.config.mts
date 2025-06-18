import tsconfigPaths from 'vite-tsconfig-paths';
import { configDefaults, coverageConfigDefaults, defineConfig, Plugin } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/getParentCommits.test.ts'],
    clearMocks: true, // Clear all mocks between each test
    coverage: {
      provider: 'v8',
      exclude: [
        'vitest.no-threads.config.ts',
        'scripts/**',
        'test-stories/**',
        '**/*.stories.{t,j}s',
        'node-src/lib/testLogger.ts',
        ...coverageConfigDefaults.exclude,
      ],
    },
  },
  plugins: [tsconfigPaths() as Plugin],
});

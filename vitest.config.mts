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
        '**/*.stories.{t,j}s',
        ...coverageConfigDefaults.exclude,
      ],
    },
  },
  plugins: [tsconfigPaths() as Plugin],
});

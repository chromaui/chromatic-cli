import { defineConfig, Plugin } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true, // Clear all mocks between each test
    coverage: {
      include: ['{bin,node}-src/**/*.{ts,tsx}', 'isChromatic.{mjs,js}'],
      exclude: ['**/*.stories.{t,j}s', '**/lib/{testLogger,testUtilities}.ts', '**/__mocks__/**'],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
});

import tsconfigPaths from 'vite-tsconfig-paths';
import { defaultExclude, defineConfig, Plugin } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true, // Clear all mocks between each test
    exclude: ['**/.claude/worktrees/**', ...defaultExclude],
    coverage: {
      include: ['{bin,node}-src/**/*.{ts,tsx}', 'isChromatic.{mjs,js}'],
      exclude: [
        '**/*.fake.ts',
        '**/*.stories.{t,j}s',
        '**/*.frames.{t,j}s',
        '**/lib/{testLogger,testUtilities}.ts',
        '**/__mocks__/**',
      ],
    },
  },
  plugins: [tsconfigPaths() as Plugin],
});

/* eslint-disable import/no-unresolved */
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/getParentCommits.test.ts'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/getParentCommits.test.ts'],
    pool: 'forks',
    maxWorkers: 1,
  },
});

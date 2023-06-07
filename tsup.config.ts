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
      entry: ['node-src/index.ts'],
      resolve: true,
    },
    treeshake: true,
    sourcemap: false,
    clean: true,
    platform: 'node',
    target: 'node16',
  },
  {
    entry: ['action-src/register.js'],
    outDir: 'action',
    splitting: false,
    minify: !options.watch,
    format: ['cjs'],
    treeshake: true,
    sourcemap: false,
    clean: true,
    platform: 'node',
    target: 'node16',
  },
]);

import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['node-src/index.ts'],
  outDir: 'node',
  splitting: false,
  minify: !options.watch,
  format: ['cjs'],
  dts: {
    resolve: true,
  },
  treeshake: true,
  sourcemap: true,
  clean: true,
  platform: 'node',
  target: 'node16',
}));

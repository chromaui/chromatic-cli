import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: {
    action: 'action-src/register.js',
    bin: 'bin-src/register.js',
    node: 'node-src/index.ts',
  },
  splitting: false,
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
}));

/* eslint-disable unicorn/no-null, unicorn/prefer-string-raw -- verbatim bundler stats output */
import { Stats } from '../../../../types';

// Stats from one small Storybook-shaped project built with webpack 5.112 (`stats.toJson()`, with
// style-loader and css-loader) and @rspack/core 1.7.12, trimmed to the fields the stats reader
// reads. node_modules records and the bundler runtime are dropped; nothing else is edited. Rebuild
// rather than hand-edit: a hand-written shape is how these suites last drifted from real output.
//
//   storybook-config-entry.js -> .storybook/preview.js -> src/hello.js -> src/hello2.js
//                             -> storybook-stories.js -> require.context(./src, /\.stories\.js$/, lazy)
//   src/Button.stories.js -> src/Button.js -> src/dep.js, src/shared.js, src/button.css,
//                                            src/cjsdep.cjs (CommonJS, so never concatenated)
//   src/Other.stories.js  -> src/shared.js
//
// Both bundlers concatenate the config entry with preview, hello and hello2, and the Button story
// with Button, dep and button.css. Each member also has a record of its own whose reasons name the
// member that imports it. Modules outside a group that a member imports (shared.js, cjsdep.cjs, the
// css-loader record) blame the group in `moduleName` and name the member in `resolvedModule`.

export const webpackStats: Stats = {
  modules: [
    {
      id: 846,
      name: './storybook-config-entry.js + 4 modules',
      nameForCondition: '/repo/packages/ui/storybook-config-entry.js',
      modules: [
        {
          name: './storybook-config-entry.js',
          nameForCondition: '/repo/packages/ui/storybook-config-entry.js',
        },
        {
          name: './.storybook/preview.js',
          nameForCondition: '/repo/packages/ui/.storybook/preview.js',
        },
        {
          name: './storybook-stories.js',
          nameForCondition: '/repo/packages/ui/storybook-stories.js',
        },
        { name: './src/hello.js', nameForCondition: '/repo/packages/ui/src/hello.js' },
        { name: './src/hello2.js', nameForCondition: '/repo/packages/ui/src/hello2.js' },
      ],
      reasons: [{ moduleName: null, resolvedModule: null }],
    },
    {
      id: null,
      name: './.storybook/preview.js',
      nameForCondition: '/repo/packages/ui/.storybook/preview.js',
      reasons: [
        {
          moduleName: './storybook-config-entry.js',
          resolvedModule: './storybook-config-entry.js',
        },
      ],
    },
    {
      id: null,
      name: './storybook-stories.js',
      nameForCondition: '/repo/packages/ui/storybook-stories.js',
      reasons: [
        {
          moduleName: './storybook-config-entry.js',
          resolvedModule: './storybook-config-entry.js',
        },
      ],
    },
    {
      id: null,
      name: './src/hello.js',
      nameForCondition: '/repo/packages/ui/src/hello.js',
      reasons: [
        { moduleName: './.storybook/preview.js', resolvedModule: './.storybook/preview.js' },
      ],
    },
    {
      id: 830,
      name: './src/ lazy \\.stories\\.js$',
      reasons: [
        {
          moduleName: './storybook-config-entry.js + 4 modules',
          resolvedModule: './storybook-stories.js',
        },
        { moduleName: './storybook-stories.js', resolvedModule: './storybook-stories.js' },
      ],
    },
    {
      id: null,
      name: './src/hello2.js',
      nameForCondition: '/repo/packages/ui/src/hello2.js',
      reasons: [{ moduleName: './src/hello.js', resolvedModule: './src/hello.js' }],
    },
    {
      id: 859,
      name: './src/Button.stories.js + 9 modules',
      nameForCondition: '/repo/packages/ui/src/Button.stories.js',
      modules: [
        {
          name: './src/Button.stories.js',
          nameForCondition: '/repo/packages/ui/src/Button.stories.js',
        },
        { name: './src/Button.js', nameForCondition: '/repo/packages/ui/src/Button.js' },
        { name: './src/dep.js', nameForCondition: '/repo/packages/ui/src/dep.js' },
        { name: './src/button.css', nameForCondition: '/repo/packages/ui/src/button.css' },
      ],
      reasons: [
        {
          moduleName: './src/ lazy \\.stories\\.js$',
          resolvedModule: './src/ lazy \\.stories\\.js$',
        },
      ],
    },
    {
      id: 781,
      name: './src/Other.stories.js',
      nameForCondition: '/repo/packages/ui/src/Other.stories.js',
      reasons: [
        {
          moduleName: './src/ lazy \\.stories\\.js$',
          resolvedModule: './src/ lazy \\.stories\\.js$',
        },
      ],
    },
    {
      id: null,
      name: './src/Button.js',
      nameForCondition: '/repo/packages/ui/src/Button.js',
      reasons: [
        { moduleName: './src/Button.stories.js', resolvedModule: './src/Button.stories.js' },
      ],
    },
    {
      id: 775,
      name: './src/shared.js',
      nameForCondition: '/repo/packages/ui/src/shared.js',
      reasons: [
        { moduleName: './src/Button.js', resolvedModule: './src/Button.js' },
        { moduleName: './src/Button.stories.js + 9 modules', resolvedModule: './src/Button.js' },
        { moduleName: './src/Other.stories.js', resolvedModule: './src/Other.stories.js' },
      ],
    },
    {
      id: null,
      name: './src/dep.js',
      nameForCondition: '/repo/packages/ui/src/dep.js',
      reasons: [{ moduleName: './src/Button.js', resolvedModule: './src/Button.js' }],
    },
    {
      id: 293,
      name: './src/cjsdep.cjs',
      nameForCondition: '/repo/packages/ui/src/cjsdep.cjs',
      reasons: [
        { moduleName: './src/Button.js', resolvedModule: './src/Button.js' },
        { moduleName: './src/Button.stories.js + 9 modules', resolvedModule: './src/Button.js' },
      ],
    },
    {
      id: null,
      name: './src/button.css',
      nameForCondition: '/repo/packages/ui/src/button.css',
      reasons: [{ moduleName: './src/Button.js', resolvedModule: './src/Button.js' }],
    },
    {
      id: 507,
      name: './node_modules/css-loader/dist/cjs.js!./src/button.css',
      nameForCondition: '/repo/packages/ui/src/button.css',
      reasons: [
        { moduleName: './src/button.css', resolvedModule: './src/button.css' },
        { moduleName: './src/Button.stories.js + 9 modules', resolvedModule: './src/button.css' },
      ],
    },
  ],
};

export const rspackStats: Stats = {
  modules: [
    {
      id: null,
      name: './storybook-config-entry.js',
      nameForCondition: '/repo/packages/ui/storybook-config-entry.js',
      reasons: [],
    },
    {
      id: 846,
      name: './storybook-config-entry.js + 4 modules',
      nameForCondition: '/repo/packages/ui/storybook-config-entry.js',
      modules: [
        {
          name: './storybook-config-entry.js',
          nameForCondition: '/repo/packages/ui/storybook-config-entry.js',
        },
        {
          name: './.storybook/preview.js',
          nameForCondition: '/repo/packages/ui/.storybook/preview.js',
        },
        {
          name: './storybook-stories.js',
          nameForCondition: '/repo/packages/ui/storybook-stories.js',
        },
        { name: './src/hello.js', nameForCondition: '/repo/packages/ui/src/hello.js' },
        { name: './src/hello2.js', nameForCondition: '/repo/packages/ui/src/hello2.js' },
      ],
      reasons: [{ moduleName: null, resolvedModule: null }],
    },
    {
      id: null,
      name: './.storybook/preview.js',
      nameForCondition: '/repo/packages/ui/.storybook/preview.js',
      reasons: [
        {
          moduleName: './storybook-config-entry.js',
          resolvedModule: './storybook-config-entry.js',
        },
      ],
    },
    {
      id: null,
      name: './storybook-stories.js',
      nameForCondition: '/repo/packages/ui/storybook-stories.js',
      reasons: [
        {
          moduleName: './storybook-config-entry.js',
          resolvedModule: './storybook-config-entry.js',
        },
      ],
    },
    {
      id: null,
      name: './src/hello.js',
      nameForCondition: '/repo/packages/ui/src/hello.js',
      reasons: [
        { moduleName: './.storybook/preview.js', resolvedModule: './.storybook/preview.js' },
      ],
    },
    {
      id: 830,
      name: './src|lazy|/\\.stories\\.js$/',
      reasons: [
        {
          moduleName: './storybook-config-entry.js + 4 modules',
          resolvedModule: './storybook-stories.js',
        },
      ],
    },
    {
      id: null,
      name: './src/hello2.js',
      nameForCondition: '/repo/packages/ui/src/hello2.js',
      reasons: [{ moduleName: './src/hello.js', resolvedModule: './src/hello.js' }],
    },
    {
      id: null,
      name: './src/Button.stories.js',
      nameForCondition: '/repo/packages/ui/src/Button.stories.js',
      reasons: [],
    },
    {
      id: 276,
      name: './src/Button.stories.js + 3 modules',
      nameForCondition: '/repo/packages/ui/src/Button.stories.js',
      modules: [
        {
          name: './src/Button.stories.js',
          nameForCondition: '/repo/packages/ui/src/Button.stories.js',
        },
        { name: './src/Button.js', nameForCondition: '/repo/packages/ui/src/Button.js' },
        { name: './src/dep.js', nameForCondition: '/repo/packages/ui/src/dep.js' },
        { name: './src/button.css', nameForCondition: '/repo/packages/ui/src/button.css' },
      ],
      reasons: [
        {
          moduleName: './src|lazy|/\\.stories\\.js$/',
          resolvedModule: './src|lazy|/\\.stories\\.js$/',
        },
      ],
    },
    {
      id: 781,
      name: './src/Other.stories.js',
      nameForCondition: '/repo/packages/ui/src/Other.stories.js',
      reasons: [
        {
          moduleName: './src|lazy|/\\.stories\\.js$/',
          resolvedModule: './src|lazy|/\\.stories\\.js$/',
        },
      ],
    },
    {
      id: null,
      name: './src/Button.js',
      nameForCondition: '/repo/packages/ui/src/Button.js',
      reasons: [
        { moduleName: './src/Button.stories.js', resolvedModule: './src/Button.stories.js' },
      ],
    },
    {
      id: 775,
      name: './src/shared.js',
      nameForCondition: '/repo/packages/ui/src/shared.js',
      reasons: [
        { moduleName: './src/Button.stories.js + 3 modules', resolvedModule: './src/Button.js' },
        { moduleName: './src/Other.stories.js', resolvedModule: './src/Other.stories.js' },
      ],
    },
    {
      id: null,
      name: './src/dep.js',
      nameForCondition: '/repo/packages/ui/src/dep.js',
      reasons: [{ moduleName: './src/Button.js', resolvedModule: './src/Button.js' }],
    },
    {
      id: null,
      name: './src/button.css',
      nameForCondition: '/repo/packages/ui/src/button.css',
      reasons: [{ moduleName: './src/Button.js', resolvedModule: './src/Button.js' }],
    },
    {
      id: 293,
      name: './src/cjsdep.cjs',
      nameForCondition: '/repo/packages/ui/src/cjsdep.cjs',
      reasons: [
        { moduleName: './src/Button.stories.js + 3 modules', resolvedModule: './src/Button.js' },
        { moduleName: './src/cjsdep.cjs', resolvedModule: './src/cjsdep.cjs' },
      ],
    },
    {
      id: 507,
      name: './node_modules/css-loader/dist/cjs.js!./src/button.css',
      nameForCondition: '/repo/packages/ui/src/button.css',
      reasons: [
        { moduleName: './src/Button.stories.js + 3 modules', resolvedModule: './src/button.css' },
      ],
    },
  ],
};

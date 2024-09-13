import eslint from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
// import jsdoc from 'eslint-plugin-jsdoc';
import noSecrets from 'eslint-plugin-no-secrets';
import prettier from 'eslint-plugin-prettier';
import security from 'eslint-plugin-security';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sortClassMembers from 'eslint-plugin-sort-class-members';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    ignores: [
      '**/node_modules/*',
      'dist/**',
      'action/**',
      'bin/**',
      '**/build/*',
      '.storybook/**',
      'storybook-static/**',
      'storybook-out/**',
      'coverage/**',
      'subdir/**',
    ],
  },
  // eslint core + overrides
  eslint.configs.recommended,
  {
    rules: {
      // check cyclomatic complexity
      complexity: ['error', 10],
      // use strict equality checks when reasonable
      eqeqeq: ['error', 'smart'],
      // require switch cases to have a default
      'default-case': ['error'],
      // max nesting depth
      'max-depth': ['error', 4],
      // max lines per file
      'max-lines': ['error', 500],
      // max statements per function
      'max-statements': ['error', 30],
      // no dialog creating methods (alert, confirm, prompt)
      'no-alert': 'error',
      // prefer function declarations over variable expressions
      'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
    },
  },
  // lint comments
  comments.recommended,
  {
    files: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'],
    rules: {
      '@eslint-community/eslint-comments/disable-enable-pair': ['error', { allowWholeFile: true }],
    },
  },
  // lint typescript
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsConfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TODO: make this an error when we have time to deal with it
      '@typescript-eslint/no-explicit-any': 'off',
      //   '@typescript-eslint/no-explicit-any': 'warn',
      // TODO: make this an error when we have time to deal with it
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  {
    files: ['**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsConfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  // allow underscore variables to be unused
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],
    },
  },
  // additional lints from unicorn
  unicorn.configs['flat/recommended'],
  {
    rules: {
      // TODO: Switch this to 'error' when we are ready to enforce this rule
      'unicorn/filename-case': ['off', { case: 'camelCase' }],
      // Chromatic uses err as our catch convention.
      // This is baked into pino transforms as well.
      'unicorn/prevent-abbreviations': [
        'off', // TODO: Switch this to 'error' when we are ready to enforce this rule
        {
          allowList: {
            err: true,
            props: true,
            ctx: true,
            str: true,
            args: true,
            docsUrl: true,
          },
        },
      ],
      'unicorn/catch-error-name': [
        'error',
        {
          ignore: ['err'],
        },
      ],
      'unicorn/switch-case-braces': 'off',
      'unicorn/no-process-exit': 'off',
      'unicorn/prefer-node-protocol': 'off', // This will error our Webpack build
      // TODO: remove the following lines when we are ready to enforce these rules
      'unicorn/no-null': 'off',
      'unicorn/better-regex': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/prefer-module': 'off',
    },
  },
  // prefer TS to complain when we miss an arg vs. sending an intentional undefined
  {
    files: ['**/*.ts'],
    rules: {
      'unicorn/no-useless-undefined': 'off',
    },
  },
  {
    files: ['node-src/ui/**'],
    rules: {
      'unicorn/no-anonymous-default-export': 'off',
    },
  },
  // security related lints
  security.configs.recommended,
  {
    files: ['**/*.js', '**/*.ts'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.ts'],
    plugins: {
      'no-secrets': noSecrets,
    },
    rules: {
      'no-secrets/no-secrets': [
        'error',
        { ignoreContent: '^(https://www.chromatic.com/|/var/folders/)*' },
      ],
    },
  },
  // run prettier and expose problems as linting errors
  // NOTE: This does slow down eslint (about 25% slower)
  // If this becomes problematic, we can discuss removing it
  {
    plugins: {
      prettier: prettier,
    },
    rules: {
      ...prettier.configs.recommended.rules,
    },
  },
  // lint jsdoc
  //   {
  //     files: ['**/*.js', '**/*.ts'],
  //     plugins: {
  //       jsdoc,
  //     },
  //     rules: {
  //       ...jsdoc.configs['flat/recommended-typescript'].rules,
  //       'jsdoc/require-jsdoc': [
  //         'error',
  //         {
  //           publicOnly: true,
  //           require: { ClassDeclaration: true, FunctionDeclaration: true },
  //           enableFixer: false,
  //         },
  //       ],
  //       'jsdoc/require-returns': ['warn', { enableFixer: true }],
  //       'jsdoc/sort-tags': [
  //         'error',
  //         {
  //           tagSequence: [{ tags: ['param'] }, { tags: ['returns'] }],
  //         },
  //       ],
  //       'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
  //     },
  //   },
  // sort your imports
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      // disable built-in import/order rule
      'import/order': 'off',
    },
  },
  // sort class members
  {
    plugins: { 'sort-class-members': sortClassMembers },
    rules: {
      'sort-class-members/sort-class-members': [
        2,
        {
          order: [
            '[static-properties]',
            '[static-methods]',
            '[properties]',
            '[conventional-private-properties]',
            'constructor',
            '[methods]',
          ],
          accessorPairPositioning: 'getThenSet',
        },
      ],
    },
  },
  // exceptions for files stuck in CJS for now
  {
    files: ['**/*.cjs'],
    rules: {
      //   'unicorn/prefer-module': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  // exceptions for test files and support
  {
    files: ['**/*.test.*'],
    rules: {
      'no-secrets/no-secrets': 'warn',
      'max-lines': 'warn',
      'jsdoc/require-jsdoc': 'off',
    },
  },
];

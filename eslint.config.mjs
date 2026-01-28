// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import eslint from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import jsdoc from 'eslint-plugin-jsdoc';
import noSecrets from 'eslint-plugin-no-secrets';
import prettier from 'eslint-plugin-prettier';
import security from 'eslint-plugin-security';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sortClassMembers from 'eslint-plugin-sort-class-members';
import storybook from 'eslint-plugin-storybook';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      'dist/**',
      'action/**',
      'bin/**',
      '**/build/**',
      '.storybook/**',
      '.storybook-test/**',
      'storybook-static/**',
      'storybook-out/**',
      'coverage/**',
      'subdir/**',
    ],
  },
  eslint.configs.recommended,
  {
    rules: {
      complexity: ['error', 10],
      eqeqeq: ['error', 'smart'],
      'default-case': ['error'],
      'max-depth': ['error', 4],
      'max-lines': ['error', 500],
      'max-statements': ['error', 30],
      'no-alert': 'error',
      'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
    },
  },
  comments.recommended,
  {
    files: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'],
    rules: {
      '@eslint-community/eslint-comments/disable-enable-pair': ['error', { allowWholeFile: true }],
    },
  },
  ...tseslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsConfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-require-imports': 'off',
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
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsConfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'no-secrets': noSecrets,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-secrets/no-secrets': 'warn',
      'max-lines': 'warn',
      'jsdoc/require-jsdoc': 'off',
      'unicorn/no-null': 'off', // GraphQL returns `null` when there is no value
    },
  },
  {
    files: ['**/*.test.js', '**/*.stories.js', '**/*.test.jsx', '**/*.stories.jsx'],
    plugins: {
      'no-secrets': noSecrets,
    },
    rules: {
      'no-secrets/no-secrets': 'warn',
      '@typescript-eslint/no-empty-function': 'off',
      'max-lines': 'warn',
      'jsdoc/require-jsdoc': 'off',
      'unicorn/no-null': 'off', // GraphQL returns `null` when there is no value
    },
  },
  unicorn.configs.recommended,
  {
    rules: {
      'unicorn/no-null': 'off',
      // 'unicorn/prefer-module': 'off',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-array-sort': 'off',
      'unicorn/no-array-reverse': 'off',
      'unicorn/filename-case': [
        'error',
        {
          case: 'camelCase',
          ignore: [
            String.raw`^.*DNS.*\.[jt]s$`,
            String.raw`^.*CSF.*\.[jt]s$`,
            String.raw`^.*TTY.*\.[jt]s$`,
            String.raw`^.*CI.*\.[jt]s$`,
            String.raw`^.*E2E.*\.[jt]s$`,
          ],
        },
      ],
      'unicorn/prevent-abbreviations': [
        'error',
        {
          checkFilenames: false,
          allowList: {
            err: true,
            props: true,
            ctx: true,
            str: true,
            args: true,
            docsUrl: true,
            fn: true,
            pkg: true,
          },
          ignore: [/.*e2e.*/, /\w+[Dd]ocs\w*/],
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
      'unicorn/prefer-node-protocol': 'off',
    },
  },
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
  {
    plugins: {
      prettier: prettier,
    },
    rules: {
      ...prettier.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.js', '**/*.ts'],
    plugins: {
      jsdoc,
    },
    rules: {
      ...jsdoc.configs['flat/recommended-typescript'].rules,
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: { ClassDeclaration: true, FunctionDeclaration: true },
          enableFixer: false,
        },
      ],
      'jsdoc/require-returns': ['warn', { enableFixer: true }],
      'jsdoc/sort-tags': [
        'error',
        {
          tagSequence: [{ tags: ['param'] }, { tags: ['returns'] }],
        },
      ],
      'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
    },
  },
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import/order': 'off',
    },
  },
  {
    plugins: {
      'sort-class-members': sortClassMembers,
    },
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
  {
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  ...storybook.configs['flat/recommended'],
];

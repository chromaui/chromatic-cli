import eslint from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-plugin-prettier';
import security from 'eslint-plugin-security';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sortClassMembers from 'eslint-plugin-sort-class-members';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// jsdoc/no-undefined-types checks a `{@link X}` only when it is in a `/** */` comment and X parses
// as a name such as `X` or `X.member`. It skips any other link silently, so this rule rejects the
// links it would skip: links in `//` or `/* */` comments, and targets such as `X#member` or `X()`.
const checkableLinks = {
  meta: {
    type: 'problem',
    messages: {
      linkOutsideJsdoc:
        'Put `{@link}` in a `/** */` comment, which jsdoc/no-undefined-types checks, or drop the link.',
      uncheckedTarget:
        'Link to `{@link X}`, `{@link X.member}`, or a URL; jsdoc/no-undefined-types skips `{{target}}`.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          // The same test the jsdoc plugin uses: `/**` followed by whitespace.
          const isJsdoc = comment.type === 'Block' && /^\*\s/.test(comment.value);
          if (!isJsdoc && /{@link(code|plain)?\s/.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: 'linkOutsideJsdoc' });
            continue;
          }
          // The target follows one space or tab, so `{@link  X}`, which the plugin skips, yields ''.
          for (const [, target] of comment.value.matchAll(
            /{@link(?:code|plain)?[\t ](\S*?)(?=[\s|}])/g
          )) {
            const isName = /^[A-Za-z_$][\w$]*(\.[\w$]+)*$/.test(target);
            if (!isName && !/^[a-z][\d+.a-z-]*:\/\//i.test(target)) {
              context.report({
                loc: comment.loc,
                messageId: 'uncheckedTarget',
                data: { target: target || 'the extra space' },
              });
            }
          }
        }
      },
    };
  },
};

export default [
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    ignores: [
      '**/node_modules/*',
      'dist/**',
      'action/**',
      'bin/**',
      '.storybook/**',
      'storybook-static/**',
      'storybook-out/**',
      'coverage/**',
      'smoke-tests/**',
      'e2e/fixtures/**',
      // Storybook config fixtures: intentionally a mix of module formats, so linting them is noise.
      'node-src/__mocks__/storybookMainConfig/**',
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
      // Split a source file that hits max-lines instead of disabling the rule.
      '@eslint-community/eslint-comments/no-restricted-disable': ['error', 'max-lines'],
    },
  },
  // These files were already past 500 lines. They may not grow past 1000; split them before then.
  {
    files: ['node-src/git/git.ts', 'node-src/types.ts'],
    rules: {
      'max-lines': ['error', 1000],
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
      '@typescript-eslint/no-floating-promises': 'error',
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
      'unicorn/filename-case': [
        'error',
        {
          case: 'camelCase',
          ignore: [
            // Allow capitalization in initialisms
            String.raw`^.*DNS.*\.[jt]s$`,
            String.raw`^.*CSF.*\.[jt]s$`,
            String.raw`^.*TTY.*\.[jt]s$`,
            String.raw`^.*CI.*\.[jt]s$`,
            String.raw`^.*E2E.*\.[jt]s$`,
          ],
        },
      ],
      // Chromatic uses err as our catch convention.
      // This is baked into pino transforms as well.
      'unicorn/prevent-abbreviations': [
        'error',
        {
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
      'unicorn/prefer-node-protocol': 'off', // This will error our Webpack build
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
  {
    files: ['**/*.js', '**/*.ts'],
    plugins: {
      jsdoc,
      local: { rules: { 'checkable-links': checkableLinks } },
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
      // A `{@link X}` must name a symbol in scope, so renaming or deleting X breaks lint instead of
      // leaving a stale link. Link a symbol from another file through an `import type`.
      'jsdoc/no-undefined-types': 'error',
      'local/checkable-links': 'error',
      // A bare `@see X` is free text to the rule above, so require the form it checks.
      'jsdoc/no-restricted-syntax': [
        'error',
        {
          contexts: [
            {
              comment: String.raw`JsdocBlock:has(JsdocTag[tag="see"][name=/^[A-Za-z_$][\w$]*([.#][\w$]+)*(\(\))?$/][description=""])`,
              context: 'any',
              message:
                'Write `@see {@link X}` instead of `@see X`, so lint checks that X still exists.',
            },
          ],
        },
      ],
    },
  },
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
      'max-lines': 'warn',
      '@eslint-community/eslint-comments/no-restricted-disable': 'off',
      'jsdoc/require-jsdoc': 'off',
      'unicorn/no-null': 'off', // GraphQL returns `null` when there is no value
      'no-restricted-syntax': [
        'error',
        ...[
          // `trace` and `trim-stats` are package.json scripts that also run dist/bin.cjs.
          String.raw`Literal[value=/yarn (run )?(chromatic|trace|trim-stats)\b|dist\/bin/]`,
          String.raw`TemplateElement[value.raw=/yarn (run )?(chromatic|trace|trim-stats)\b|dist\/bin/]`,
          String.raw`CallExpression:matches([callee.name=/^(exec|execFile|spawn|execa)(Sync)?$/], [callee.property.name=/^(exec|execFile|spawn|execa)(Sync)?$/])[arguments.0.value='yarn']`,
        ].map((selector) => ({
          selector,
          message:
            'Call the command in-process (for example `main()` from bin-src/trace.ts). Spawning `yarn chromatic` runs dist/bin.cjs, which is missing on a fresh checkout and stale after a source change.',
        })),
      ],
    },
  },
];

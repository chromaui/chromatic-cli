module.exports = {
  root: true,
  extends: ['@storybook/eslint-config-storybook'],
  rules: {
    'no-use-before-define': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'eslint-comments/disable-enable-pair': 'off',
    'import/no-extraneous-dependencies': 'off',
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.eslint.json'],
    extraFileExtensions: ['.cjs'],
  },
  overrides: [
    {
      files: ['*.json', 'isChromatic.mjs', 'isChromatic.js', 'isChromatic.cjs', '.eslintrc.cjs'],
      parser: 'esprima',
      rules: {
        '@typescript-eslint/naming-convention': 'off',
        '@typescript-eslint/dot-notation': 'off',
        '@typescript-eslint/no-implied-eval': 'off',
        '@typescript-eslint/no-throw-literal': 'off',
        '@typescript-eslint/return-await': 'off',
      },
    },
  ],
};

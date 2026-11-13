import untracedStorybookConfig from './untracedStorybookConfig';

export default {
  title: 'CLI/Messages/Info',
};

export const UntracedStorybookConfig = () =>
  untracedStorybookConfig({
    matches: [{ filepath: '.storybook/preview.ts', glob: '.storybook/**' }],
  });

export const UntracedStorybookConfigMultiple = () =>
  untracedStorybookConfig({
    matches: [
      { filepath: 'packages/ui/.storybook/main.ts', glob: 'packages/ui/.storybook/**' },
      { filepath: 'packages/ui/.storybook/preview.tsx', glob: 'packages/ui/.storybook/**' },
      { filepath: 'packages/ui/.storybook/preview-head.html', glob: '**/*.html' },
    ],
  });

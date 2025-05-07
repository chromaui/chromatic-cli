export const builders = {
  webpack4: '@storybook/builder-webpack4',
  webpack5: '@storybook/builder-webpack5',
  '@storybook/vite-builder': '@storybook/builder-vite',
  '@storybook/builder-webpack5': '@storybook/html-vite',
  '@storybook/html-vite': '@storybook/builder-vite',
} as Record<string, string>;

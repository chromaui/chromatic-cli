import { Context } from '../../types';

export const initial = (_ctx: Context) => ({
  status: 'initial',
  title: 'Upload your Storybook for sharing',
});

export const starting = (_ctx: Context) => ({
  status: 'pending',
  title: 'Uploading your Storybook for sharing',
  output: 'Starting upload',
});

export const success = (_ctx: Context) => ({
  status: 'success',
  title: 'Storybook uploaded for sharing',
});

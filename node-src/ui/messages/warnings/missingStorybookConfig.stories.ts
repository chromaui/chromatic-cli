import missingStorybookConfig from './missingStorybookConfig';

export default {
  title: 'CLI/Messages/Warnings',
};

export const MissingStorybookConfig = () => missingStorybookConfig('/repo/packages/ui/.storybook');

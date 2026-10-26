import speedUpCI from './speedUpCI';

export default {
  title: 'CLI/Messages/Info',
};

export const SpeedUpCI = () => speedUpCI('github', false);

export const SpeedUpCIInAction = () => speedUpCI('github', true);

import speedUpCI from './speedUpCI';

export default {
  title: 'CLI/Messages/Info',
};

export const SpeedUpCI = () => speedUpCI('github');
export const SpeedUpCIAzure = () => speedUpCI('azure');
export const SpeedUpCIUnknown = () => speedUpCI('unknown-provider');

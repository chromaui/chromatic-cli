import speedUpCI from './speedUpCI';

export default {
  title: 'CLI/Messages/Info',
};

export const SpeedUpCI = () => speedUpCI('github');
export const SpeedUpCIAdo = () => speedUpCI('ado');
export const SpeedUpCIUnknown = () => speedUpCI('unknown-provider');

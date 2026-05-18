import unsupportedNodeVersion from './unsupportedNodeVersion';

export default {
  title: 'CLI/Messages/Warnings',
};

export const UnsupportedNodeVersion = () => unsupportedNodeVersion('20.20.1', '>=22.0.0');

import deprecatedOption from './deprecatedOption';

export default {
  title: 'CLI/Messages/Warnings',
};

export const DeprecatedOption = () => deprecatedOption({ flag: 'preserveMissing' });

import { missingConfigurationFile } from './missingConfigurationFile';

export default {
  title: 'CLI/Messages/Errors',
};

export const MissingConfigurationFile = () => missingConfigurationFile('./my.config.json');

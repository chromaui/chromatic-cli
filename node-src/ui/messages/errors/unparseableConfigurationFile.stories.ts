import { unparseableConfigurationFile } from './unparseableConfigurationFile';

export default {
  title: 'CLI/Messages/Errors',
};

let err;
try {
  JSON.parse('foo');
} catch (error) {
  err = error;
}

export const UnparseableConfigurationFile = () =>
  unparseableConfigurationFile('./my.config.json', err);

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

export const UnparseableConfigurationFileJson = () =>
  unparseableConfigurationFile('./my.config.json', err);

export const UnparseableConfigurationFileJson5 = () =>
  unparseableConfigurationFile('./my.config.json5', err);

export const UnparseableConfigurationFileJsonc = () =>
  unparseableConfigurationFile('./my.config.jsonc', err);

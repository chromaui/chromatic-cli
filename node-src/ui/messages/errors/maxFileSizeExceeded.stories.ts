import { maxFileSizeExceeded } from './maxFileSizeExceeded';

export default {
  title: 'CLI/Messages/Errors',
};

export const MaxFileSizeExceeded = () =>
  maxFileSizeExceeded({ filePaths: ['index.js', 'main.js'], maxFileSize: 12_345 });

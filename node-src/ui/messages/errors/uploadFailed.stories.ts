import { uploadFailed } from './uploadFailed';

export default {
  title: 'CLI/Messages/Errors',
};

const target = {
  contentLength: 12345,
  localPath: 'local/path/to/file.js',
  targetPath: 'file.js',
  contentType: 'text/javascript',
  fileKey: 'file-key',
  filePath: 'file.js',
  formAction: 'https://bucket.s3.amazonaws.com/',
  formFields: { key: 'file-key', 'Content-Type': 'text/javascript' },
};

export const UploadFailed = () => uploadFailed({ target });

export const UploadFailedDebug = () => uploadFailed({ target }, true);

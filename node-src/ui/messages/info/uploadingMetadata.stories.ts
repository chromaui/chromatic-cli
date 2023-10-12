import { files } from '../../html/metadata.html.stories';
import uploadingMetadata from './uploadingMetadata';

export default {
  title: 'CLI/Messages/Info',
};

const directoryUrl = 'https://5d67dc0374b2e300209c41e7-dlmmxasauj.chromatic.com/.chromatic/';

export const UploadingMetadata = () => uploadingMetadata(directoryUrl, files);

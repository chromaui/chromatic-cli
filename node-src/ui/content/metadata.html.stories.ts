import { files } from '../messages/info/uploadingMetadata.stories';
import metadataHtml from './metadata.html';

export default {
  title: 'HTML/Metadata index',
};

const announced: any = { announcedBuild: { number: 7801 } };

const build: any = {
  ...announced,
  build: { webUrl: 'https://www.chromatic.com/build?appId=5d67dc0374b2e300209c41e7&number=7801' },
};

export const Default = () => metadataHtml(announced, files);

export const BuildUrl = () => metadataHtml(build, files);

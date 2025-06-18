import type { Meta, StoryObj } from '@storybook/html-vite';

import { FileDesc } from '../../../types';
import { files } from '../../html/metadata.html.stories';
import uploadingMetadata from './uploadingMetadata';

const directoryUrl = 'https://5d67dc0374b2e300209c41e7-dlmmxasauj.chromatic.com/.chromatic/';

interface Properties {
  directoryUrl: string;
  files: FileDesc[];
}

export default {
  title: 'CLI/Messages/Info',
  render: (args: Properties) => uploadingMetadata(args.directoryUrl, args.files),
  args: {
    directoryUrl,
    files,
  },
} satisfies Meta<Properties>;

type Story = StoryObj<Properties>;

export const UploadingMetadata: Story = {
  args: {
    directoryUrl,
    files,
  },
};

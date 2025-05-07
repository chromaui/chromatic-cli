import type { Meta, StoryObj } from '@storybook/html-vite';

import wroteReport from './wroteReport';

interface Properties {
  filePath: string;
  label: string;
}

export default {
  title: 'CLI/Messages/Info',
  render: (args: Properties) => wroteReport(args.filePath, args.label),
  args: {
    filePath: './chromatic-diagnostics.json',
    label: 'Chromatic diagnostics',
  },
} satisfies Meta<Properties>;

type Story = StoryObj<Properties>;

export const WroteChromaticDiagnostics: Story = {
  args: {
    filePath: './chromatic-diagnostics.json',
    label: 'Chromatic diagnostics',
  },
};

export const WroteJUnitReport: Story = {
  args: {
    filePath: './chromatic-build-123.xml',
    label: 'JUnit XML',
  },
};

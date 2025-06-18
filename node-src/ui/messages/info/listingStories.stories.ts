import type { Meta, StoryObj } from '@storybook/html-vite';

import listingStories from './listingStories';

interface Spec {
  name: string;
  component: { name: string };
}

interface Properties {
  snapshots: { spec: Spec }[];
}

const meta = {
  title: 'CLI/Messages/Info',
  render: (args: Properties) => listingStories(args.snapshots),
  args: {
    snapshots: [
      { spec: { name: 'MyStory', component: { name: 'Path/To/MyComponent' } } },
      { spec: { name: 'AnotherStory', component: { name: 'Path/To/MyComponent' } } },
      { spec: { name: 'SomeStory', component: { name: 'Path/To/AnotherComponent' } } },
    ],
  },
} satisfies Meta<Properties>;

export default meta;

type Story = StoryObj<Properties>;

export const ListingStories: Story = {
  args: {
    snapshots: [
      { spec: { name: 'MyStory', component: { name: 'Path/To/MyComponent' } } },
      { spec: { name: 'AnotherStory', component: { name: 'Path/To/MyComponent' } } },
      { spec: { name: 'SomeStory', component: { name: 'Path/To/AnotherComponent' } } },
    ],
  },
};

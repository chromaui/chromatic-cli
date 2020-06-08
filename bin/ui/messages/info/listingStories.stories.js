import listingStories from './listingStories';

export default {
  title: 'CLI/Messages/Info',
};

const snapshots = [
  { spec: { name: 'MyStory', component: { name: 'Path/To/MyComponent' } } },
  { spec: { name: 'AnotherStory', component: { name: 'Path/To/MyComponent' } } },
  { spec: { name: 'SomeStory', component: { name: 'Path/To/AnotherComponent' } } },
];

export const ListingStories = () => listingStories(snapshots);

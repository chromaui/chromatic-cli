import storybookPublished from './storybookPublished';

export default {
  title: 'CLI/Messages/Info',
};

export const StorybookPublished = () =>
  storybookPublished({
    build: {
      number: 42,
      componentCount: 5,
      specCount: 8,
      cachedUrl: 'https://5d67dc0374b2e300209c41e7-pfkaemtlit.chromatic.com/iframe.html',
    },
  });

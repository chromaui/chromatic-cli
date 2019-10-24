export const extract = global => {
  const { __STORYBOOK_CLIENT_API__ } = global;

  if (!__STORYBOOK_CLIENT_API__) {
    throw new Error(
      `Chromatic requires Storybook version at least 3.4. Please update your Storybook!`
    );
  }

  // eslint-disable-next-line no-underscore-dangle
  const storyStore = __STORYBOOK_CLIENT_API__._storyStore;

  // Storybook 5+ API
  if (storyStore.extract) {
    return Object.values(storyStore.extract());
  }

  // Storybook 4- API
  return __STORYBOOK_CLIENT_API__
    .getStorybook()
    .map(({ kind, stories }) =>
      stories.map(({ name }) => ({
        kind,
        name,
        parameters:
          storyStore.getStoryAndParameters &&
          storyStore.getStoryAndParameters(kind, name).parameters,
      }))
    )
    .reduce((a, b) => [...a, ...b], []); // flatten
};

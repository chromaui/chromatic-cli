function specFromStory({ id, kind, name, parameters: { chromatic } = {} }) {
  const param = value => (typeof value === 'function' ? value({ id, kind, name }) : value);
  return {
    storyId: id,
    name,
    component: {
      name: kind,
      displayName: kind.split(/\||\/|\./).slice(-1)[0],
    },
    parameters:
      chromatic &&
      ['viewports', 'delay', 'disable', 'noScroll', 'diffThreshold'].reduce(
        (acc, key) => (chromatic[key] ? { ...acc, [key]: param(chromatic[key]) } : acc),
        {}
      ),
  };
}

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
    return Object.values(storyStore.extract()).map(specFromStory);
  }

  // Storybook 4- API
  return __STORYBOOK_CLIENT_API__
    .getStorybook()
    .map(({ kind, stories }) =>
      stories.map(({ name }) =>
        specFromStory({
          kind,
          name,
          parameters:
            storyStore.getStoryAndParameters &&
            storyStore.getStoryAndParameters(kind, name).parameters,
        })
      )
    )
    .reduce((a, b) => [...a, ...b], []); // flatten
};

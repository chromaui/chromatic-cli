const CHROMATIC_PARAMETERS = [
  'viewports',
  'delay',
  'disable',
  'noScroll',
  'diffThreshold',
  'pauseAnimationAtEnd',
];

export function toSpec({ id, kind, name, parameters: { chromatic } = {} }) {
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
      CHROMATIC_PARAMETERS.reduce(
        (acc, key) => (chromatic[key] ? { ...acc, [key]: param(chromatic[key]) } : acc),
        {}
      ),
  };
}

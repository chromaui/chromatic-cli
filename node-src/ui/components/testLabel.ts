import { BuildTest } from '../../types';

// Names a test by component and story display name, as Chromatic shows it, with the mode or
// viewport in brackets when the test doesn't use the default viewport.
export const testLabel = ({ spec, parameters, mode }: BuildTest) => {
  const variant = mode.name || `${parameters.viewport}px`;
  const suffix = parameters.viewportIsDefault ? '' : ` [${variant}]`;
  return `${spec.component.displayName} › ${spec.name}${suffix}`;
};

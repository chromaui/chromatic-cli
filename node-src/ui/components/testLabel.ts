import { BuildTest } from '../../types';

// Names a test by component and story display name, as Chromatic shows it, with its mode in
// brackets. A story without modes gets a mode named after its viewport, such as "1200px", which is
// left out at the default viewport. A named mode, such as "Dark", shows at any viewport.
export const testLabel = ({ spec, parameters, mode }: BuildTest) => {
  const isDefaultMode = parameters.viewportIsDefault && mode.name === `${parameters.viewport}px`;
  const suffix = isDefaultMode ? '' : ` [${mode.name}]`;
  return `${spec.component.displayName} › ${spec.name}${suffix}`;
};

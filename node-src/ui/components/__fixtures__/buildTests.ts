import { BuildTest } from '../../../types';

const storyNames = [
  'Primary',
  'Primary Dark',
  'Secondary',
  'Disabled',
  'Loading',
  'With Label',
  'Playground',
  'Filled',
  'Empty',
  'Error',
];

// A story without modes gets a mode named after its default viewport. Named modes here change only
// globals such as the theme, so they keep the default viewport too.
export const buildTest = (component: string, story: string, mode = '1200px'): BuildTest => ({
  spec: { name: story, component: { name: component, displayName: component } },
  parameters: { viewport: 1200, viewportIsDefault: true },
  mode: { id: mode, name: mode },
});

// `count` example tests of one component, for stories and tests of messages that list tests.
export const buildTests = (component: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    buildTest(component, storyNames[index] ?? `Variant ${index + 1}`)
  );

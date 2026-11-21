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

export const buildTest = (component: string, story: string, mode?: string): BuildTest => ({
  spec: { name: story, component: { name: component, displayName: component } },
  parameters: { viewport: 1280, viewportIsDefault: !mode },
  mode: { id: mode ?? '', name: mode ?? '' },
});

// `count` example tests of one component, for stories and tests of messages that list tests.
export const buildTests = (component: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    buildTest(component, storyNames[index] ?? `Variant ${index + 1}`)
  );

export const erroredTests = (component: string, count: number, hasInteractionFailure = false) =>
  buildTests(component, count).map((test) => ({ ...test, hasInteractionFailure }));

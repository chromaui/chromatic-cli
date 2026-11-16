import turboSnapDryRun from './turboSnapDryRun';

export default {
  title: 'CLI/Messages/Info',
};

export const TurboSnapDryRun = () =>
  turboSnapDryRun({
    options: {} as any,
    onlyStoryFiles: ['./Button.stories.tsx', './Card.stories.tsx'],
  });

export const TurboSnapDryRunHashBased = () =>
  turboSnapDryRun({ options: {} as any, hashBased: true });

import task from '../components/task';
import { initial, pending, skipFailed, skipped, success } from './start';

export default {
  title: 'CLI/Tasks/Start',
  decorators: [(storyFn: any) => task(storyFn())],
};

const isolatorUrl = 'https://5eb48280e78a12aeeaea33cf-kdypokzbrs.chromatic.com/iframe.html';

export const Initial = () => initial;

export const Starting = () => pending({ options: { scriptName: 'start-storybook' } } as any);

export const StartingCommand = () => pending({ options: { exec: './start.sh' } } as any);

export const Started = () => success({ isolatorUrl, now: 0, startedAt: -21000 } as any);

export const Skipped = () => skipped({ isolatorUrl, options: {} } as any);

export const SkipFailed = () => skipFailed({ options: { url: isolatorUrl } } as any);

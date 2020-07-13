import task from '../components/task';
import { initial, pending, skipFailed, skipped, success } from './start';

export default {
  title: 'CLI/Tasks/Start',
  decorators: [storyFn => task(storyFn())],
};

const isolatorUrl = 'https://5eb48280e78a12aeeaea33cf-kdypokzbrs.chromatic.com/iframe.html';

export const Initial = () => initial;

export const Starting = () => pending({ options: { scriptName: 'start-storybook' } });

export const StartingCommand = () => pending({ options: { commandName: './start.sh' } });

export const Started = () => success({ isolatorUrl, now: 0, startedAt: -21000 });

export const Skipped = () => skipped({ isolatorUrl, options: {} });

export const NoStart = () => skipped({ isolatorUrl, options: { noStart: true } });

export const SkipFailed = () => skipFailed({ options: { url: isolatorUrl } });

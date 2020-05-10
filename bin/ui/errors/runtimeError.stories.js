import runtimeError from './runtimeError';

export default {
  title: 'CLI/Errors',
};

console.error('ooops!');
console.warn('warn!');

export const RuntimeError = () => {
  const runtimeErrors = [new Error('Oh no!')];
  const context = { title: 'Verify the uploaded Storybook', runtimeErrors };
  return runtimeError(context);
};

export const RuntimeWarning = () => {
  const runtimeWarnings = [new Error('Oops!')];
  const context = { title: 'Verify the uploaded Storybook', runtimeWarnings };
  return runtimeError(context);
};

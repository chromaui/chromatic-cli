import taskError from './taskError';

export default {
  title: 'CLI/Messages/Errors',
};

export const TaskError = () => taskError({ title: 'Run a job' }, new Error('Something went wrong'));

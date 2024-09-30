import task from './task';

export default {
  title: 'CLI/Components/Task',
};

const outputArray = ['Line one', 'Line two'];
const outputString = `
  Line one
  Line two
`;

export const Initial = () =>
  task({ status: 'initial', title: 'Waiting for task to start', output: outputArray });
export const Pending = () =>
  task({ status: 'pending', title: 'Task in progress', output: outputArray });
export const Skipped = () =>
  task({ status: 'skipped', title: 'Task skipped', output: outputArray });
export const Success = () =>
  task({ status: 'success', title: 'Successfully completed task', output: outputString });
export const Warning = () =>
  task({ status: 'warning', title: 'Be aware this is a warning', output: outputString });
export const Info = () => task({ status: 'info', title: "Here's some info", output: outputString });
export const Error = () =>
  task({ status: 'error', title: 'Something went wrong', output: outputString });

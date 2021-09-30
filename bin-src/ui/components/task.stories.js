import task from './task';

export default {
  title: 'CLI/Components/Task',
};

const arr = ['Line one', 'Line two'];
const str = `
  Line one
  Line two
`;

export const Initial = () =>
  task({ status: 'initial', title: 'Waiting for task to start', output: arr });
export const Pending = () => task({ status: 'pending', title: 'Task in progress', output: arr });
export const Skipped = () => task({ status: 'skipped', title: 'Task skipped', output: arr });
export const Success = () =>
  task({ status: 'success', title: 'Successfully completed task', output: str });
export const Warning = () =>
  task({ status: 'warning', title: 'Be aware this is a warning', output: str });
export const Info = () => task({ status: 'info', title: "Here's some info", output: str });
export const Error = () => task({ status: 'error', title: 'Something went wrong', output: str });

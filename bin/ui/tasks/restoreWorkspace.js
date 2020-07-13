export const initial = {
  status: 'initial',
  title: 'Restore workspace',
};

export const pending = ctx => ({
  status: 'pending',
  title: 'Restoring your workspace',
  output: `Discarding changes and restoring head location`,
});

export const success = ctx => ({
  status: 'success',
  title: `Restored your workspace`,
});

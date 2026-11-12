export const pending = () => ({
  status: 'pending',
  title: 'Restoring your workspace',
  output: `Discarding changes and restoring head location`,
});

export const success = () => ({
  status: 'success',
  title: `Restored your workspace`,
});

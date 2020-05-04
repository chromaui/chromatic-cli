import changesDetected from './changesDetected';

export default {
  title: 'CLI/Errors',
};

export const ChangesDetected = () =>
  changesDetected({
    build: { changeCount: 42 },
  });

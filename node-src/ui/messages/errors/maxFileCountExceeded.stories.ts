import { maxFileCountExceeded } from './maxFileCountExceeded';

export default {
  title: 'CLI/Messages/Errors',
};

export const MaxFileCountExceeded = () =>
  maxFileCountExceeded({
    fileCount: 54_321,
    maxFileCount: 20_000,
  });

import fatalError from './fatalError';
import pkg from '../../../../package.json';

export default {
  title: 'CLI/Messages/Errors',
};

export const FatalError = () => {
  const context = { title: 'Run a job', pkg };
  const error = new SyntaxError("That's not right!");
  return fatalError(context, error);
};

export const FatalErrorSimple = () => {
  const context = { title: 'Run a job', pkg };
  const error = { message: "That's not right!" };
  return fatalError(context, error);
};

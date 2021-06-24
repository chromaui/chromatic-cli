import task from '../components/task';
import {
  checkoutMergeBase,
  initial,
  installingDependencies,
  lookupMergeBase,
  pending,
  success,
} from './prepareWorkspace';

export default {
  title: 'CLI/Tasks/PrepareWorkspace',
  decorators: [(storyFn) => task(storyFn())],
};

const options = {
  scriptName: 'build-storybook',
  patchBaseRef: 'main',
  patchHeadRef: 'feature',
};
const mergeBase = '3f35708745837024bec510c0e5d8a3ac00ba6467';

export const Initial = () => initial;

export const Pending = () => pending({ options });

export const LookupMergeBase = () => lookupMergeBase({ options });

export const CheckoutMergeBase = () => checkoutMergeBase({ options, mergeBase });

export const InstallingDependencies = () => installingDependencies({ options });

export const Success = () => success({ options, mergeBase });

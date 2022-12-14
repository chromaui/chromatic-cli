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
  decorators: [(storyFn: any) => task(storyFn())],
};

const options = {
  buildScriptName: 'build-storybook',
  patchBaseRef: 'main',
  patchHeadRef: 'feature',
};
const mergeBase = '3f35708745837024bec510c0e5d8a3ac00ba6467';

export const Initial = () => initial;

export const Pending = () => pending();

export const LookupMergeBase = () => lookupMergeBase({ options } as any);

export const CheckoutMergeBase = () => checkoutMergeBase({ options, mergeBase } as any);

export const InstallingDependencies = () => installingDependencies();

export const Success = () => success({ options, mergeBase } as any);

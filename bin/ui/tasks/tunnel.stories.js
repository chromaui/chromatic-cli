import task from '../components/task';
import { initial, pending, success, failed } from './tunnel';

export default {
  title: 'CLI/Tasks/Tunnel',
  decorators: [storyFn => task(storyFn())],
};

const tunnelUrl = 'https://tunnel.chromaticqa.com';
const cachedUrl = 'https://fdeulpymiq.tunnel.chromaticqa.com/iframe.html';

export const Initial = () => initial;

export const Pending = () => pending({ options: { tunnelUrl } });

export const Success = () => success({ cachedUrl });

export const Failed = () => failed({ cachedUrl });

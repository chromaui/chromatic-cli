import task from '../components/task';
import { failed, initial, pending, success } from './tunnel';

export default {
  title: 'CLI/Tasks/Tunnel',
  decorators: [storyFn => task(storyFn())],
};

const CHROMATIC_TUNNEL_URL = 'https://tunnel.chromaticqa.com';
const cachedUrl = 'https://fdeulpymiq.tunnel.chromaticqa.com/iframe.html';

export const Initial = () => initial;

export const Pending = () => pending({ env: { CHROMATIC_TUNNEL_URL } });

export const Success = () => success({ cachedUrl });

export const Failed = () => failed({ cachedUrl });

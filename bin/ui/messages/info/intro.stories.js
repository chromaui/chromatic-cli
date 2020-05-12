import intro from './intro';
import pkg from '../../../../package.json';

export default {
  title: 'CLI/Messages/Info',
};

export const Intro = () => intro({ pkg });

import intro from './intro';
import pkg from '../../package.json';

export default {
  title: 'CLI/Intro',
};

export const Default = () => intro({ pkg });

import externalsChanged from './externalsChanged';

export default {
  title: 'CLI/Messages/Warnings',
};

export const ExternalChanged = () => externalsChanged(['./styles/main.scss']);

export const ExternalsChanged = () =>
  externalsChanged(['./styles/main.scss', './styles/font.woff']);

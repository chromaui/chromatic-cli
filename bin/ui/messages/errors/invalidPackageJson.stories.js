import invalidPackageJson from './invalidPackageJson';

export default {
  title: 'CLI/Messages/Errors',
};

export const InvalidPackageJson = () => invalidPackageJson('/path/to/package.json');

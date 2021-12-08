import csfGlobs from './csfGlobs';

export default {
  title: 'CLI/Messages/Info',
};

export const CSFGlobs = () =>
  csfGlobs({
    globs: ['../bin-src/ui/**/*.stories.js', '../**/stories/*.stories.js'],
    modules: ['../asd'],
  });

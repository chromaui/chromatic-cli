import { matchesFile } from './utils';

describe('matchesFile', () => {
  it('matches file names', () => {
    expect(matchesFile('file.js', 'file.js')).toStrictEqual(true);
    expect(matchesFile('file.js', 'test.js')).toStrictEqual(false);
    expect(matchesFile('file.js', 'file.ts')).toStrictEqual(false);
  });

  it('matches file name patterns', () => {
    expect(matchesFile('*.js', 'file.js')).toStrictEqual(true);
    expect(matchesFile('*.js', 'file.ts')).toStrictEqual(false);
    expect(matchesFile('*.stories.js', 'test.stories.js')).toStrictEqual(true);
    expect(matchesFile('*.stories.js', 'test.js')).toStrictEqual(false);
  });

  it('matches file extension patterns', () => {
    expect(matchesFile('*.[jt]s', 'file.js')).toStrictEqual(true);
    expect(matchesFile('*.[jt]s', 'file.ts')).toStrictEqual(true);
  });

  it('matches directory patterns', () => {
    expect(matchesFile('*/file.js', 'src/file.js')).toStrictEqual(true);
    expect(matchesFile('*/file.js', 'file.js')).toStrictEqual(false);
    expect(matchesFile('**/file.js', 'file.js')).toStrictEqual(true);
    expect(matchesFile('**/file.js', 'path/to/file.js')).toStrictEqual(true);
  });

  it('matches dotfiles', () => {
    expect(matchesFile('src/*', 'src/.dotfile')).toStrictEqual(true);
  });

  it('matches ./ prefix', () => {
    expect(matchesFile('src/*', './src/file.js')).toStrictEqual(true);
  });
});

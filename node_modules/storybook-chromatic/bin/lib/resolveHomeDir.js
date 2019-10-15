import path from 'path';

export function resolveHomeDir(filepath) {
  return filepath && filepath.startsWith('~')
    ? path.join(process.env.HOME, filepath.slice(1))
    : filepath;
}

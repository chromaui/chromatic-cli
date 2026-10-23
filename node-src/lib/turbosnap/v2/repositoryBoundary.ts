import path from 'path';

/**
 * Tests path containment without accepting sibling prefixes, another drive, or relative roots.
 * The caller must also check resolved paths when filesystem symlinks are possible.
 *
 * @param root The trusted absolute boundary.
 * @param file The absolute path to check.
 *
 * @returns Whether the path is the root or one of its descendants.
 */
export function isPathWithinRoot(root: string, file: string): boolean {
  if (!path.isAbsolute(root) || !path.isAbsolute(file)) return false;
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

import { AbsolutePath } from '../../../types';
import { Logger } from '../../log';
import { ProjectFiles } from './projectFiles';

/**
 * Everything the manifest pipeline needs from outside itself: where the project is, where the stats
 * file's paths are named from, where the out-of-graph inputs live, and what to read the disk with.
 *
 * One type rather than one per stage, because every stage of building the manifest works against the
 * same project. Each stage narrows it to the fields it actually uses with a `Pick`.
 */
export interface ManifestInput {
  /** The logger to use for logging. */
  log: Logger;
  /** The absolute Storybook project root that canonical manifest keys are relative to. */
  projectRoot: AbsolutePath;
  /**
   * The absolute directory relative stats paths are named from. Defaults to the project root, which
   * is where a builder usually names them from.
   */
  statsRoot?: AbsolutePath;
  /** How to read the disk; required, so no caller can silently get the real one. */
  projectFiles: ProjectFiles;
  /** The absolute Storybook config directory, as it arrives on `ctx.storybook`. */
  configDir: AbsolutePath;
  /** The absolute configured static directories. Empty when unset. */
  staticDirs: AbsolutePath[];
}

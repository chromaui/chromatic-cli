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
  /** The absolute git repository root. */
  gitRoot: AbsolutePath;
  /**
   * The absolute directory relative stats paths are named from. Defaults to the project root, which
   * is where a builder usually names them from.
   */
  statsRoot?: AbsolutePath;
  /**
   * The `--untraced` globs, relative to `gitRoot`, naming files that wall off tracing: neither their
   * own changes nor those of files reached only through them recapture stories. Empty when unset.
   */
  untraced: string[];
  /** The absolute Storybook config directory, as it arrives on `ctx.storybook`. */
  configDir: AbsolutePath;
  /**
   * The E2E package whose bundled Storybook the build uploads, such as `@chromatic-com/vitest`. Set
   * only for E2E builds. The package ships the Storybook config and install, so the project has
   * neither: the package's name and version stand in for `storybookVersion`, `configDir` is not
   * swept, and `storybookConfigFiles` is the roll-up of no files. `configDir` still decides which
   * graph files count as `preview`, and a real build still hashes the static directories its
   * `main.*` declares, when the project has one.
   */
  e2ePackage?: string;
  /** The absolute configured static directories, or single static files. Empty when unset. */
  staticDirs: AbsolutePath[];
  /** The user's `--externals` globs, relative to `gitRoot`. Empty when unset. */
  externals: string[];
  /** How to read the disk; required, so no caller can silently get the real one. */
  projectFiles: ProjectFiles;
}

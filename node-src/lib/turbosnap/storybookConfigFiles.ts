import path from 'path';

import { MAIN_CONFIG_PATTERN, PREVIEW_CONFIG_PATTERN } from '../getStorybookMetadata';

// The Storybook config files whose changes can affect every story, shared by TurboSnap 1.0 and 2.0
// so the two agree on which files those are. Each check takes a file path and the config directory
// in the same form (both absolute, both repository-relative, or both canonical manifest paths), and
// only matches files directly inside the directory, not in its subdirectories.

/**
 * Which allowlisted Storybook config file a path is. The names double as the `changedStorybookFiles`
 * bail subreasons sent to the index.
 */
type StorybookConfigFileKind = 'mainConfig' | 'previewConfig' | 'previewHead' | 'previewBody';

/**
 * Finds which allowlisted Storybook config file a path is, if any: `main.*`, `preview.*`,
 * `preview-head.html` or `preview-body.html`, directly inside the config directory. Every other file
 * in the config directory (manager files, mocks, fixtures, decorators, helpers) is ordinary source.
 *
 * @param filePath The path to check.
 * @param configDirectory The Storybook config directory, in the same form as `filePath`.
 *
 * @returns The kind of config file, or `undefined` when the path isn't on the allowlist.
 */
function storybookConfigFileKind(
  filePath: string,
  configDirectory: string
): StorybookConfigFileKind | undefined {
  if (path.dirname(filePath) !== configDirectory) return undefined;

  const fileName = path.basename(filePath);
  if (MAIN_CONFIG_PATTERN.test(fileName)) return 'mainConfig';
  if (PREVIEW_CONFIG_PATTERN.test(fileName)) return 'previewConfig';
  if (fileName === 'preview-head.html') return 'previewHead';
  if (fileName === 'preview-body.html') return 'previewBody';
  return undefined;
}

/**
 * Whether a path is the project's `main.*` Storybook config file.
 *
 * @param filePath The path to check.
 * @param configDirectory The Storybook config directory, in the same form as `filePath`.
 *
 * @returns Whether the path is the main config file.
 */
export function isMainConfigFile(filePath: string, configDirectory: string): boolean {
  return storybookConfigFileKind(filePath, configDirectory) === 'mainConfig';
}

/**
 * Whether a path is the project's `preview.*` Storybook config file.
 *
 * @param filePath The path to check.
 * @param configDirectory The Storybook config directory, in the same form as `filePath`.
 *
 * @returns Whether the path is the preview config file.
 */
export function isPreviewConfig(filePath: string, configDirectory: string): boolean {
  return storybookConfigFileKind(filePath, configDirectory) === 'previewConfig';
}

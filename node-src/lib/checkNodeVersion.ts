import { satisfies } from 'semver';

import unsupportedNodeVersion from '../ui/messages/warnings/unsupportedNodeVersion';
import { Logger } from './log';

/**
 * Warn the user if the current Node.js runtime does not satisfy the supported range declared in
 * the CLI's `engines.node` field in `package.json`.
 *
 * @param log The logger to emit the warning to.
 * @param supportedRange The semver range of Node.js versions Chromatic supports.
 */
export default function checkNodeVersion(log: Logger, supportedRange: string | undefined) {
  if (!supportedRange) {
    return;
  }

  if (!satisfies(process.versions.node, supportedRange)) {
    log.warn(unsupportedNodeVersion(process.versions.node, supportedRange));
  }
}

import { readFile } from 'fs/promises';
import path from 'path';

import { Deps } from '../types';

const SetComponentOwnersMutation = `
  mutation SetComponentOwners($buildId: ObjID!, $content: String!) {
    setComponentOwners(buildId: $buildId, content: $content) {
      buildId
    }
  }
`;

/**
 * Tries to set component owners based on the COMPONENTOWNERS file, if present at the repository root.
 * Setting component owners is best effort and should never fail the build. Because of this, this function
 * never throws.
 *
 * @param deps Dependencies (the GraphQL client, the logger, the options)
 * @param rootPath Absolute path to the repository root.
 * @param buildId ID of the announced build.
 */
export async function trySetComponentOwnersIfPresent(
  deps: Readonly<Pick<Deps, 'client' | 'log' | 'options'>>,
  rootPath: string,
  buildId: string
) {
  try {
    const content = await readFile(path.join(rootPath, 'COMPONENTOWNERS'), 'utf8');
    await deps.client.runQuery(SetComponentOwnersMutation, {
      buildId,
      content,
    });
    // The upload is a debugging aid, not a build step, so interactive runs keep it out of the
    // Clack UI and only write it to the log file.
    const log = deps.options.interactive ? deps.log.file : deps.log.info;
    log('Uploaded COMPONENTOWNERS');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      deps.log.debug('No COMPONENTOWNERS file found at the repository root. Skipping.');
      return;
    }
    deps.log.warn('Unable to set component owners.', err);
  }
}

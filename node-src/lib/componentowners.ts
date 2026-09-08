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
 * @param deps Dependencies (the GraphQL client, the logger)
 * @param rootPath Absolute path to the repository root.
 * @param buildId ID of the announced build.
 */
export async function trySetComponentOwnersIfPresent(
  deps: Readonly<Pick<Deps, 'client' | 'log'>>,
  rootPath: string,
  buildId: string
) {
  try {
    const content = await readFile(path.join(rootPath, 'COMPONENTOWNERS'), 'utf8');
    await deps.client.runQuery(SetComponentOwnersMutation, {
      buildId,
      content,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // COMPONENTOWNERS file not present. Skip and move on.
      return;
    }
    deps.log.warn('Unable to set component owners.', err);
  }
}

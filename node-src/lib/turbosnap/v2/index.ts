import { Context } from '../../../types';
import { TraceChangedFilesResult } from '../types';

/**
 * Determines which story files are affected by the changed source file hashes, bailing out of TurboSnap
 * when necessary.
 *
 * @param _ctx The context set when executing the CLI.
 *
 * @returns The trace result: skipped, bailed, or traced with the affected story files.
 */
export async function traceChangedFiles(_ctx: Context): Promise<TraceChangedFilesResult> {
  return {
    status: 'skipped',
  };
}

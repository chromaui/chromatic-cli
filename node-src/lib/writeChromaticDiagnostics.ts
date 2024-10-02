import jsonfile from 'jsonfile';

import { Context } from '..';
import wroteReport from '../ui/messages/info/wroteReport';
import { redact } from './utils';

const { writeFile } = jsonfile;

/**
 * Extract important information from ctx, sort it and output into a json file
 *
 * @param ctx The context set when executing the CLI.
 */
export async function writeChromaticDiagnostics(ctx: Context) {
  if (!ctx.options.diagnosticsFile) {
    return;
  }

  try {
    await writeFile(ctx.options.diagnosticsFile, getDiagnostics(ctx), { spaces: 2 });
    ctx.log.info(wroteReport(ctx.options.diagnosticsFile, 'Chromatic diagnostics'));
  } catch (error) {
    ctx.log.error(error);
  }
}

/**
 * Extract diagnostic information for the Chromatic diagnostics file.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns An object containing all information for the Chromatic diagnostics file.
 */
export function getDiagnostics(ctx: Context) {
  // Drop some fields that are not useful to have and redact sensitive fields
  const { argv, client, env, help, http, log, pkg, title, ...rest } = ctx;
  const data = redact(rest, 'projectToken', 'reportToken', 'userToken');

  // Sort top-level fields alphabetically
  return Object.fromEntries(
    Object.keys(data)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, data[key]])
  );
}

import jsonfile from 'jsonfile';

import { Context } from '..';
import wroteReport from '../ui/messages/info/wroteReport';
import { redact } from './utils';

const { writeFile } = jsonfile;

export function getDiagnostics(ctx: Context) {
  // Drop some fields that are not useful to have and redact sensitive fields
  const { argv, client, env, help, http, log, pkg, title, ...rest } = ctx;
  const data = redact(rest, 'projectToken', 'reportToken', 'userToken');

  // Sort top-level fields alphabetically
  return Object.keys(data)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => ({ ...acc, [key]: data[key] }), {});
}

// Extract important information from ctx, sort it and output into a json file
export async function writeChromaticDiagnostics(ctx: Context) {
  try {
    await writeFile(ctx.options.diagnosticsFile, getDiagnostics(ctx), { spaces: 2 });
    ctx.log.info(wroteReport(ctx.options.diagnosticsFile, 'Chromatic diagnostics'));
  } catch (error) {
    ctx.log.error(error);
  }
}

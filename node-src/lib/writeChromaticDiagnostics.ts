import { mkdirSync, rmSync } from 'fs';
import jsonfile from 'jsonfile';
import path from 'path';

import { Context } from '..';
import wroteReport from '../ui/messages/info/wroteReport';
import { redact, redactValues } from './utilities';

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
    // Ensure the parent directory exists before writing file
    mkdirSync(path.dirname(ctx.options.diagnosticsFile), { recursive: true });

    await writeFile(ctx.options.diagnosticsFile, getDiagnostics(ctx), { spaces: 2 });
    ctx.log.info(wroteReport(ctx.options.diagnosticsFile, 'Chromatic diagnostics'));
  } catch (error) {
    ctx.log.error(error);
  }
}

/**
 * Remove the diagnostics file we wrote during the run. Used to clean up a diagnostics file that
 * was enabled implicitly (e.g. for metadata upload) rather than requested by the user.
 *
 * @param ctx The context set when executing the CLI.
 */
export function removeChromaticDiagnostics(ctx: Context) {
  if (!ctx.options.diagnosticsFile) {
    return;
  }

  try {
    rmSync(ctx.options.diagnosticsFile, { force: true });
  } catch (error) {
    ctx.log.error(error);
  }
}

/**
 * Collect every credential value the run resolved, so serialization can scrub them from
 * places key-based redaction cannot see into (like the plain strings of originalArgv).
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns The credential values to scrub from serialized output.
 */
function getSecretValues(ctx: Context) {
  return [
    ctx.options?.projectToken,
    ctx.env?.CHROMATIC_PROJECT_TOKEN,
    ctx.options?.userToken,
    ctx.build?.reportToken,
    ctx.announcedBuild?.reportToken,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

/**
 * Extract diagnostic information for the Chromatic diagnostics file.
 *
 * @param ctx The context set when executing the CLI.
 *
 * @returns An object containing all information for the Chromatic diagnostics file.
 */
export function getDiagnostics(ctx: Context) {
  // Collect credentials before redacting, so the value backstop can scrub them wherever
  // they appear (e.g. inside the plain strings of options.originalArgv).
  const secrets = getSecretValues(ctx);

  // Drop fields that are not useful to serialize: argv, clients, env, logger, etc. The
  // analytics client in particular is a live handle that references the GraphQL client —
  // and through it the env and auth headers — so it must never be serialized.
  const { analytics, argv, client, env, help, http, log, pkg, title, ...rest } = ctx;
  const data = redactValues(redact(rest, 'projectToken', 'reportToken', 'userToken'), secrets);

  // Sort top-level fields alphabetically
  return Object.fromEntries(
    Object.keys(data)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, data[key]])
  );
}

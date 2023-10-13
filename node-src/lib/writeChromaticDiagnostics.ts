import jsonfile from 'jsonfile';
import { Context } from '../types';
import wroteReport from '../ui/messages/info/wroteReport';

const { writeFile } = jsonfile;

export const CHROMATIC_DIAGNOSTICS_FILE = 'chromatic-diagnostics.json';

const redact = <T>(value: T, ...fields: string[]): T => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, ...fields)) as T;
  const obj = { ...value };
  for (const key in obj) obj[key] = fields.includes(key) ? undefined : redact(obj[key], ...fields);
  return obj;
};

export function getDiagnostics(ctx: Context) {
  // Drop some fields that are not useful to have and redact sensitive fields
  const { argv, client, env, help, http, log, pkg, title, ...rest } = ctx;
  const data = redact(rest, 'projectToken', 'reportToken');

  // Sort top-level fields alphabetically
  return Object.keys(data)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => ({ ...acc, [key]: data[key] }), {});
}

// Extract important information from ctx, sort it and output into a json file
export async function writeChromaticDiagnostics(ctx: Context) {
  try {
    await writeFile(CHROMATIC_DIAGNOSTICS_FILE, getDiagnostics(ctx), { spaces: 2 });
    ctx.log.info(wroteReport(CHROMATIC_DIAGNOSTICS_FILE, 'Chromatic diagnostics'));
  } catch (error) {
    ctx.log.error(error);
  }
}

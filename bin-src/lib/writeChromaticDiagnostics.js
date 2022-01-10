import jsonfile from 'jsonfile';
import wroteReport from '../ui/messages/info/wroteReport';

const { writeFile } = jsonfile;

export function getDiagnostics(ctx) {
  const { argv, client, env, help, http, log, pkg, task, title, ...rest } = ctx;
  return Object.keys(rest)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => ({ ...acc, [key]: rest[key] }), {});
}

// Extract important information from ctx, sort it and output into a json file
export async function writeChromaticDiagnostics(ctx) {
  try {
    const chromaticDiagnosticsPath = 'chromatic-diagnostics.json';
    await writeFile(chromaticDiagnosticsPath, getDiagnostics(ctx), { spaces: 2 });
    ctx.log.info(wroteReport(chromaticDiagnosticsPath, 'Chromatic diagnostics'));
  } catch (error) {
    ctx.log.error(error);
  }
}

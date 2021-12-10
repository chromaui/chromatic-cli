import jsonfile from 'jsonfile';
import wroteReport from '../ui/messages/info/wroteReport';

const { writeFile } = jsonfile;

// Extract important information from ctx, sort it and output into a json file
export async function writeChromaticReport(ctx) {
  const chromaticReportPath = 'chromatic-report.json';
  const { argv, client, env, help, http, log, pkg, task, title, ...restCtx } = ctx;
  const reportContext = Object.keys(restCtx)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => ({ ...acc, [key]: restCtx[key] }), {});
  return writeFile(chromaticReportPath, reportContext, { spaces: 2 })
    .then(() => ctx.log.info(wroteReport(chromaticReportPath, 'Chromatic')))
    .catch((err) => {
      ctx.log.error(err);
    });
}

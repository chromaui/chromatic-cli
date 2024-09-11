import * as Sentry from '@sentry/node';

export default (environment: string) => {
  Sentry.init({
    dsn: 'https://4fa173db2ef3fb073b8ea153a5466d28@o4504181686599680.ingest.us.sentry.io/4507930289373184',
    sampleRate: 1.0,
    environment,
    enabled: process.env.DISABLE_ERROR_MONITORING !== 'true',
    enableTracing: false,
    integrations: [],
  });
}

import wroteReport from './wroteReport';

export default {
  title: 'CLI/Messages/Info',
};

export const WroteChromaticDiagnostics = () =>
  wroteReport('./chromatic-diagnostics.json', 'Chromatic diagnostics');
export const WroteJUnitReport = () => wroteReport('./chromatic-build-123.xml', 'JUnit XML');

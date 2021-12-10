import wroteReport from './wroteReport';

export default {
  title: 'CLI/Messages/Info',
};

export const WroteReport = () => wroteReport('./chromatic-report.xml', 'Chromatic');
export const WroteJUnitReport = () => wroteReport('./chromatic-build-123.xml', 'JUnit XML');

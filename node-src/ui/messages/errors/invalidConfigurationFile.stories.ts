import { z } from 'zod';
import { invalidConfigurationFile } from './invalidConfigurationFile';

export default {
  title: 'CLI/Messages/Errors',
};

let err;
try {
  z.object({
    a: z.string(),
    b: z.number(),
  }).parse({ a: 1, b: '1' });
} catch (aErr) {
  err = aErr;
}

export const InvalidConfigurationFile = () => invalidConfigurationFile('./my.config.json', err);

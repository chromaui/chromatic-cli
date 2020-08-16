// dotenv set CHROMATIC_PROJECT_TOKEN to test token
// detenv-expand set CHROMATIC_PROJECT_TOKEN_BASE to CHROMATIC_PROJECT_TOKEN
const fs = require('fs');

const fileName = '.env';

const tokenName = 'CHROMATIC_PROJECT_TOKEN';

describe('inject environment variables', () => {
  beforeAll(() => {
    try {
      fs.appendFileSync(fileName, `${tokenName}=test token\n${tokenName}_BASE=$${tokenName}\n`);
    } catch (err) {
      throw new Error(err);
    }
  });

  test('var CHROMATIC_PROJECT_TOKEN_BASE should be defined in environment', async () => {
    await import('./readEnv');
    expect(process.env.CHROMATIC_PROJECT_TOKEN_BASE).toBe('test token');
  });

  afterAll(() => {
    fs.unlink(fileName, err => {
      if (err) throw err;
    });
  });
});

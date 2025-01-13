import fetch from 'node-fetch';

// This is a temp (and limited) API key. This should be removed when we no longer need our TurboSnap
// metrics.
const NEW_RELIC_KEY = 'f887ede1f80741a1cd368cac8c8aa11fFFFFNRAL';
const NEW_RELIC_ENDPOINT = 'https://log-api.newrelic.com/log/v1';

/**
 * Writes a log line to New Relic
 *
 * @param data The object to write
 */
export async function writeLog(data: object) {
  const body = JSON.stringify({
    name: 'cli',
    service: 'cli',
    ...data,
  });

  try {
    await fetch(NEW_RELIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Api-Key': NEW_RELIC_KEY,
      },
      body,
    });
  } catch {
    // Purposefully left blank
  }
}

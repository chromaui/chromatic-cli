import { describe, expect, it, vi } from 'vitest';

describe('CHROMATIC_NOTIFY_SERVICE_URL', () => {
  it('returns production url by default', async () => {
    const { default: getEnvironment } = await import('./getEnvironment');
    expect(getEnvironment().CHROMATIC_NOTIFY_SERVICE_URL).toBe('wss://notify.chromatic.com');
  });

  it('returns dev url if index url is dev', async () => {
    vi.stubEnv('CHROMATIC_INDEX_URL', 'https://index.dev-chromatic.com');
    vi.resetModules();

    const { default: getEnvironment } = await import('./getEnvironment');
    expect(getEnvironment().CHROMATIC_NOTIFY_SERVICE_URL).toBe('wss://notify.dev-chromatic.com');
  });

  it('returns staging url if index url is staging', async () => {
    vi.stubEnv('CHROMATIC_INDEX_URL', 'https://index.staging-chromatic.com');
    vi.resetModules();

    const { default: getEnvironment } = await import('./getEnvironment');
    expect(getEnvironment().CHROMATIC_NOTIFY_SERVICE_URL).toBe(
      'wss://notify.staging-chromatic.com'
    );
  });

  it('returns the configured CHROMATIC_NOTIFY_SERVICE_URL if it is set', async () => {
    vi.stubEnv('CHROMATIC_NOTIFY_SERVICE_URL', 'wss://notify.other-chromatic.com');
    vi.resetModules();

    const { default: getEnvironment } = await import('./getEnvironment');
    expect(getEnvironment().CHROMATIC_NOTIFY_SERVICE_URL).toBe('wss://notify.other-chromatic.com');
  });
});

describe.each([
  'CHROMATIC_TURBOSNAP_DISABLE_HASHES',
  'CHROMATIC_TURBOSNAP_DISABLE_BASELINE_FETCH',
] as const)('%s', (name) => {
  it('is off when the variable is not set', async () => {
    const { default: getEnvironment } = await import('./getEnvironment');
    expect(getEnvironment()[name]).toBe(false);
  });

  it('is off when the variable is set to an empty string', async () => {
    vi.stubEnv(name, '');
    vi.resetModules();

    const { default: getEnvironment } = await import('./getEnvironment');
    expect(getEnvironment()[name]).toBe(false);
  });

  it.each(['1', 'false'])('is off when the variable is set to %s', async (value) => {
    vi.stubEnv(name, value);
    vi.resetModules();

    const { default: getEnvironment } = await import('./getEnvironment');
    expect(getEnvironment()[name]).toBe(false);
  });

  it('is on when the variable is set to true', async () => {
    vi.stubEnv(name, 'true');
    vi.resetModules();

    const { default: getEnvironment } = await import('./getEnvironment');
    expect(getEnvironment()[name]).toBe(true);
  });
});

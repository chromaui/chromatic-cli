import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from './logger';
import { createMemoryLogger } from './loggerMemoryAdapter';
import { createRealLogger } from './loggerRealAdapter';

interface AdapterSetup {
  adapter: Logger;
  /** Capture the next argument sequence routed to a level. Returns the captured args. */
  captureNext: (level: 'error' | 'warn' | 'info' | 'debug') => () => any[];
}

function realSetup(): AdapterSetup {
  const adapter = createRealLogger({ logLevel: 'debug' } as any);
  const calls: Record<string, any[]> = { error: [], warn: [], info: [], debug: [] };
  const consoleSpies = {
    error: vi.spyOn(console, 'error').mockImplementation((...args: any[]) => {
      calls.error.push(args);
    }),
    warn: vi.spyOn(console, 'warn').mockImplementation((...args: any[]) => {
      calls.warn.push(args);
    }),
    info: vi.spyOn(console, 'info').mockImplementation((...args: any[]) => {
      calls.info.push(args);
    }),
    debug: vi.spyOn(console, 'debug').mockImplementation((...args: any[]) => {
      calls.debug.push(args);
    }),
  };
  return {
    adapter,
    captureNext: (level) => () => {
      const last = calls[level].at(-1) ?? [];
      return last;
    },
    // expose for cleanup
    ...({ consoleSpies } as any),
  };
}

function memorySetup(): AdapterSetup {
  const adapter = createMemoryLogger();
  return {
    adapter,
    captureNext: (level) => () => {
      const mock = adapter[level] as ReturnType<typeof vi.fn>;
      return mock.mock.calls.at(-1) ?? [];
    },
  };
}

const adapters = [
  ['real', realSetup],
  ['memory', memorySetup],
] as const;

describe.each(adapters)('Logger (%s)', (_name, makeSetup) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes info messages through info()', () => {
    const { adapter, captureNext } = makeSetup();
    const next = captureNext('info');
    adapter.info('hello world');
    expect(next().some((entry) => String(entry).includes('hello world'))).toBe(true);
  });

  it('routes warnings through warn()', () => {
    const { adapter, captureNext } = makeSetup();
    const next = captureNext('warn');
    adapter.warn('careful');
    expect(next().some((entry) => String(entry).includes('careful'))).toBe(true);
  });

  it('routes errors through error()', () => {
    const { adapter, captureNext } = makeSetup();
    const next = captureNext('error');
    adapter.error('boom');
    expect(next().some((entry) => String(entry).includes('boom'))).toBe(true);
  });

  it('routes debug messages through debug() when level allows', () => {
    const { adapter, captureNext } = makeSetup();
    const next = captureNext('debug');
    adapter.debug('detail');
    expect(next().some((entry) => String(entry).includes('detail'))).toBe(true);
  });
});

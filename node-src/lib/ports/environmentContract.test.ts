import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Environment } from './environment';
import { createInMemoryEnvironment, InMemoryEnvironmentState } from './environmentInMemoryAdapter';
import { createRealEnvironment } from './environmentRealAdapter';

vi.mock('env-ci', () => ({ default: vi.fn() }));

const environmentCiModule = await import('env-ci');
const environmentCiMock = vi.mocked(environmentCiModule.default);

interface AdapterSetup {
  adapter: Environment;
  setVar: (key: string, value: string | undefined) => void;
  setCi: (service: string | undefined) => void;
}

const realProcessEnvironment = process.env;

function realSetup(): AdapterSetup {
  process.env = {};
  return {
    adapter: createRealEnvironment(),
    setVar: (key, value) => {
      if (value === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    },
    setCi: (service) => environmentCiMock.mockReturnValue((service ? { service } : {}) as any),
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryEnvironmentState = { vars: {} };
  return {
    adapter: createInMemoryEnvironment(state),
    setVar: (key, value) => {
      state.vars = { ...state.vars, [key]: value };
    },
    setCi: (service) => {
      state.ci = service;
    },
  };
}

const adapters = [
  ['real', realSetup],
  ['in-memory', inMemorySetup],
] as const;

describe.each(adapters)('Environment (%s)', (name, makeSetup) => {
  beforeEach(() => {
    environmentCiMock.mockReturnValue({} as any);
  });

  afterEach(() => {
    if (name === 'real') process.env = realProcessEnvironment;
    vi.clearAllMocks();
  });

  it('reads env-var values', () => {
    const { adapter, setVar } = makeSetup();
    setVar('FOO', 'bar');
    expect(adapter.get('FOO')).toBe('bar');
    expect(adapter.get('BAZ')).toBeUndefined();
  });

  it('returns a snapshot of all env-vars', () => {
    const { adapter, setVar } = makeSetup();
    setVar('A', '1');
    setVar('B', '2');
    expect(adapter.all()).toEqual(expect.objectContaining({ A: '1', B: '2' }));
  });

  it('reports the detected CI service', () => {
    const { adapter, setCi } = makeSetup();
    expect(adapter.ci()).toBeUndefined();
    setCi('github-actions');
    expect(adapter.ci()).toBe('github-actions');
  });
});

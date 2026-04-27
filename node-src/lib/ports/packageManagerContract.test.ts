import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PackageManager } from './packageManager';
import {
  createInMemoryPackageManager,
  InMemoryPackageManagerState,
} from './packageManagerInMemoryAdapter';
import { createRealPackageManager } from './packageManagerRealAdapter';
import type { ProcessRunner } from './processRunner';

vi.mock('@antfu/ni', () => ({
  getCliCommand: vi.fn(),
  parseNa: {},
  parseNr: {},
}));

vi.mock('yarn-or-npm', () => ({
  hasYarn: vi.fn(() => false),
  spawn: vi.fn(),
}));

const niModule = await import('@antfu/ni');
const yarnOrNpmModule = await import('yarn-or-npm');
const niGetCliCommand = vi.mocked(niModule.getCliCommand);
const yonHasYarn = vi.mocked(yarnOrNpmModule.hasYarn);
const yonSpawn = vi.mocked(yarnOrNpmModule.spawn);

interface AdapterSetup {
  adapter: PackageManager;
  primeName: (name: string) => void;
  primeVersionStdout: (stdout: string) => void;
  primeRunCommand: (command: string) => void;
  primeExecOk: (args: string[], stdout: string) => void;
  primeYarnPresent: () => void;
}

function realSetup(): AdapterSetup {
  const proc: ProcessRunner = {
    run: vi.fn(async () => ({ stdout: '', stderr: '', all: '', exitCode: 0 })),
  } as any;
  return {
    adapter: createRealPackageManager({ proc }),
    primeName: (name) => niGetCliCommand.mockResolvedValue(name as any),
    primeVersionStdout: (stdout) => {
      (proc.run as any).mockResolvedValue({ stdout, stderr: '', all: stdout, exitCode: 0 });
    },
    primeRunCommand: (command) => niGetCliCommand.mockResolvedValue(command as any),
    primeExecOk: (args, stdout) => {
      yonSpawn.mockImplementation((spawnArguments: any) => {
        const child: any = {
          stdout: {
            on: (event: string, callback: any) => event === 'data' && callback(Buffer.from(stdout)),
          },
          stderr: { on: () => {} },
          on: (event: string, callback: any) => {
            if (event === 'close') queueMicrotask(() => callback(0));
          },
        };
        expect(spawnArguments).toEqual(args);
        return child;
      });
    },
    primeYarnPresent: () => yonHasYarn.mockReturnValue(true),
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryPackageManagerState = { execResponses: new Map() };
  return {
    adapter: createInMemoryPackageManager(state),
    primeName: (name) => {
      state.info = { name, version: state.info?.version ?? '0.0.0' };
    },
    primeVersionStdout: (stdout) => {
      const version = stdout.trim().replace(/^v/, '');
      state.info = { name: state.info?.name ?? 'npm', version };
    },
    primeRunCommand: (command) => {
      state.runCommand = () => command;
    },
    primeExecOk: (args, stdout) => state.execResponses?.set(args.join(' '), { stdout }),
    primeYarnPresent: () => {
      state.hasYarn = true;
    },
  };
}

const adapters = [
  ['real', realSetup],
  ['in-memory', inMemorySetup],
] as const;

describe.each(adapters)('PackageManager (%s)', (_name, makeSetup) => {
  afterEach(() => {
    vi.clearAllMocks();
    yonHasYarn.mockReturnValue(false);
  });

  it('detects the package manager name and version', async () => {
    const { adapter, primeName, primeVersionStdout } = makeSetup();
    primeName('npm');
    primeVersionStdout('v8.19.2');
    const result = await adapter.detect();
    expect(result).toEqual({ name: 'npm', version: '8.19.2' });
  });

  it('returns the run-command string for the supplied args', async () => {
    const { adapter, primeRunCommand } = makeSetup();
    primeRunCommand('npm run build:storybook');
    const result = await adapter.getRunCommand(['build:storybook']);
    expect(result).toBe('npm run build:storybook');
  });

  it('execs the package manager and resolves with trimmed stdout', async () => {
    const { adapter, primeExecOk } = makeSetup();
    primeExecOk(['config', 'get', 'registry'], 'https://registry.npmjs.org/\n');
    const result = await adapter.exec(['config', 'get', 'registry']);
    expect(result.trim()).toBe('https://registry.npmjs.org/');
  });

  it('reports yarn-lock presence', async () => {
    const { adapter, primeYarnPresent } = makeSetup();
    expect(adapter.hasYarn()).toBe(false);
    primeYarnPresent();
    expect(adapter.hasYarn()).toBe(true);
  });
});

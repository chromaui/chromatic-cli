import { PassThrough, Transform } from 'node:stream';

import { execa as execaDefault } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as shell from '../lib/shell/shell';
import TestLogger from '../lib/testLogger';
import gitNoCommits from '../ui/messages/errors/gitNoCommits';
import gitNotInitialized from '../ui/messages/errors/gitNotInitialized';
import gitNotInstalled from '../ui/messages/errors/gitNotInstalled';
import {
  execGitCommand,
  execGitCommandCountLines,
  execGitCommandEntries,
  execGitCommandOneLine,
} from './execGit';

const ctx = { log: new TestLogger() };
const execa = vi.mocked(execaDefault);

vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  return {
    ...actual,
    execa: vi.fn(() => Promise.resolve()),
  };
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('execGitCommand', () => {
  it('returns execa output if it works', async () => {
    execa.mockResolvedValue({
      all: Buffer.from('some output'),
    } as any);

    expect(await execGitCommand(ctx, 'some command')).toEqual('some output');
  });

  it('errors if there is no output', async () => {
    execa.mockResolvedValue({
      all: undefined,
    } as any);

    await expect(execGitCommand(ctx, 'some command')).rejects.toThrow(/Unexpected missing git/);
  });

  it('handles missing git error', async () => {
    execa.mockRejectedValue(new Error('not a git repository'));

    await expect(execGitCommand(ctx, 'some command')).rejects.toThrow(
      gitNotInitialized({ command: 'some command' })
    );
  });

  it('handles git not found error', async () => {
    execa.mockRejectedValue(new Error('git not found'));

    await expect(execGitCommand(ctx, 'some command')).rejects.toThrow(
      gitNotInstalled({ command: 'some command' })
    );
  });

  it('handles no commits yet', async () => {
    execa.mockRejectedValue(new Error('does not have any commits yet'));

    await expect(execGitCommand(ctx, 'some command')).rejects.toThrow(
      gitNoCommits({ command: 'some command' })
    );
  });

  it('rethrows arbitrary errors', async () => {
    execa.mockRejectedValue(new Error('something random'));
    await expect(execGitCommand(ctx, 'some command')).rejects.toThrow('something random');
  });

  it('uses a default timeout of 20 seconds when none is specified', async () => {
    const runCommand = vi
      .spyOn(shell, 'runCommand')
      .mockReturnValue(Promise.resolve({ all: Buffer.from('output') }) as any);

    await execGitCommand(ctx, 'some command');

    expect(runCommand).toHaveBeenCalledWith(
      'some command',
      expect.objectContaining({ timeout: 20_000 })
    );
  });

  it('overrides the default timeout when a custom one is provided', async () => {
    const runCommand = vi
      .spyOn(shell, 'runCommand')
      .mockReturnValue(Promise.resolve({ all: Buffer.from('output') }) as any);

    await execGitCommand(ctx, 'some command', { timeout: 60_000 });

    expect(runCommand).toHaveBeenCalledWith(
      'some command',
      expect.objectContaining({ timeout: 60_000 })
    );
    expect(runCommand).not.toHaveBeenCalledWith(
      'some command',
      expect.objectContaining({ timeout: 20_000 })
    );
  });
});

describe('execGitCommandEntries', () => {
  it('yields each NUL-terminated entry, however the output is chunked', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const entries = Array.fromAsync(execGitCommandEntries(ctx, 'some command'));

    streamer.stdout.write('first\0sec');
    streamer.stdout.write('ond\0third\0');
    streamer.stdout.end();
    streamer._resolver();

    expect(await entries).toEqual(['first', 'second', 'third']);
  });

  it('yields a final entry that has no terminator', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const entries = Array.fromAsync(execGitCommandEntries(ctx, 'some command'));

    streamer.stdout.write('first\0last');
    streamer.stdout.end();
    streamer._resolver();

    expect(await entries).toEqual(['first', 'last']);
  });

  it('keeps a multi-byte character whole across a chunk boundary', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const entries = Array.fromAsync(execGitCommandEntries(ctx, 'some command'));

    const bytes = Buffer.from('caf\u00E9\0');
    streamer.stdout.write(bytes.subarray(0, 4));
    streamer.stdout.write(bytes.subarray(4));
    streamer.stdout.end();
    streamer._resolver();

    expect(await entries).toEqual(['caf\u00E9']);
  });

  it('yields nothing for empty output', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const entries = Array.fromAsync(execGitCommandEntries(ctx, 'some command'));

    streamer.stdout.end();
    streamer._resolver();

    expect(await entries).toEqual([]);
  });

  it('translates a failed command like the buffered variant does', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const entries = Array.fromAsync(execGitCommandEntries(ctx, 'some command'));

    streamer.stdout.end();
    streamer._rejecter(new Error('fatal: not a git repository'));

    await expect(entries).rejects.toThrow(gitNotInitialized({ command: 'some command' }));
  });

  it('kills the process when the consumer stops early', async () => {
    const runCommand = vi.spyOn(shell, 'runCommand');
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const first = firstEntryOf(execGitCommandEntries(ctx, 'some command'));
    // runCommand replaces kill with a tree kill, so the spy goes on what it returned.
    const kill = vi.fn();
    runCommand.mock.results[0].value.kill = kill;
    streamer.stdout.write('first\0second\0');

    expect(await first).toBe('first');
    expect(kill).toHaveBeenCalled();
  });

  it('handles the exit of a process the consumer stopped early, so it is never an unhandled rejection', async () => {
    // No spy on runCommand here: a spy tracks the settled state of what it returns, which would
    // handle the rejection itself and hide the gap this test is for.
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    try {
      await firstEntryOf(execGitCommandEntries(ctx, 'some command'), () =>
        streamer.stdout.write('first\0second\0')
      );
      streamer._rejecter(new Error('killed'));
      await new Promise((resolve) => setImmediate(resolve));

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('reads stdout alone, unbuffered, with the git timeout', async () => {
    const runCommand = vi.spyOn(shell, 'runCommand');
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const entries = Array.fromAsync(execGitCommandEntries(ctx, 'some command'));
    streamer.stdout.end();
    streamer._resolver();
    await entries;

    expect(runCommand).toHaveBeenCalledWith(
      'some command',
      expect.objectContaining({ timeout: 20_000, buffer: false, all: false })
    );
  });
});

/**
 * Reads one entry and stops, the way a consumer that has what it needs would.
 *
 * @param entries The entries to read from.
 * @param feed Writes the output to read, once the iteration is waiting on it.
 *
 * @returns The first entry.
 */
async function firstEntryOf(entries: AsyncIterable<string>, feed?: () => void) {
  const first = (async () => {
    for await (const entry of entries) {
      return entry;
    }
  })();
  feed?.();
  return first;
}

function createExecaStreamer() {
  let resolver;
  let rejecter;
  const promiseLike = new Promise((aResolver, aRejecter) => {
    resolver = aResolver;
    rejecter = aRejecter;
  }) as Promise<unknown> & {
    stdout: Transform;
    _resolver: () => void;
    _rejecter: (err: Error) => void;
  };
  promiseLike.stdout = new PassThrough();
  promiseLike._resolver = resolver;
  promiseLike._rejecter = rejecter;
  return promiseLike;
}

describe('execGitCommandOneLine', () => {
  it('returns the first line if the command works', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const promise = execGitCommandOneLine(ctx, 'some command');

    streamer.stdout.write('First line\n');
    streamer.stdout.write('Second line\n');

    expect(await promise).toEqual('First line');
  });

  it('returns the output if the command only has one line', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const promise = execGitCommandOneLine(ctx, 'some command');

    streamer.stdout.write('First line\n');
    streamer.stdout.end();

    expect(await promise).toEqual('First line');
  });

  it('Return an error if the command has no output', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const promise = execGitCommandOneLine(ctx, 'some command');

    streamer._resolver();

    await expect(promise).rejects.toThrow(/missing git command output/);
  });

  it('rethrows arbitrary errors', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const promise = execGitCommandOneLine(ctx, 'some command');

    streamer._rejecter(new Error('some error'));

    await expect(promise).rejects.toThrow(/some error/);
  });
});

describe('execGitCommandCountLines', () => {
  it('counts lines, many', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const promise = execGitCommandCountLines(ctx, 'some command');

    streamer.stdout.write('First line\n');
    streamer.stdout.write('Second line\n');
    streamer._resolver();

    expect(await promise).toEqual(2);
  });

  it('counts lines, one', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const promise = execGitCommandCountLines(ctx, 'some command');

    streamer.stdout.write('First line\n');
    streamer._resolver();

    expect(await promise).toEqual(1);
  });

  it('counts lines, none', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const promise = execGitCommandCountLines(ctx, 'some command');

    streamer._resolver();

    expect(await promise).toEqual(0);
  });
});

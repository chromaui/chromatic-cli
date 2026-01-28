import { PassThrough, Transform } from 'node:stream';

import { execa as execaDefault } from 'execa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestLogger from '../lib/testLogger';
import gitNoCommits from '../ui/messages/errors/gitNoCommits';
import gitNotInitialized from '../ui/messages/errors/gitNotInitialized';
import gitNotInstalled from '../ui/messages/errors/gitNotInstalled';
import { execGitCommand, execGitCommandCountLines, execGitCommandOneLine } from './execGit';

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
  vi.clearAllMocks();
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
});

function createExecaStreamer() {
  let resolver;
  let rejecter;
  const promiseLike = new Promise((aResolver, aRejecter) => {
    resolver = aResolver;
    rejecter = aRejecter;
  }) as Promise<unknown> & {
    stdout: Transform;
    kill: () => void;
    _rejecter: (err: Error) => void;
  };
  promiseLike.stdout = new PassThrough();
  promiseLike.kill = resolver;
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

  it('Return an error if the command has no ouput', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const promise = execGitCommandOneLine(ctx, 'some command');

    streamer.kill();

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
    streamer.kill();

    expect(await promise).toEqual(2);
  });

  it('counts lines, one', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const promise = execGitCommandCountLines(ctx, 'some command');

    streamer.stdout.write('First line\n');
    streamer.kill();

    expect(await promise).toEqual(1);
  });

  it('counts lines, none', async () => {
    const streamer = createExecaStreamer();
    execa.mockReturnValue(streamer as any);

    const promise = execGitCommandCountLines(ctx, 'some command');

    streamer.kill();

    expect(await promise).toEqual(0);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ErrorReporter } from './errorReporter';
import {
  createInMemoryErrorReporter,
  InMemoryErrorReporterState,
  RecordedException,
} from './errorReporterInMemoryAdapter';
import { createSentryErrorReporter } from './errorReporterSentryAdapter';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  flush: vi.fn(async () => true),
}));

const sentryModule = await import('@sentry/node');
const sentryCapture = vi.mocked(sentryModule.captureException);
const sentrySetTag = vi.mocked(sentryModule.setTag);
const sentrySetContext = vi.mocked(sentryModule.setContext);
const sentryFlush = vi.mocked(sentryModule.flush);

interface AdapterSetup {
  adapter: ErrorReporter;
  recordedExceptions: () => RecordedException[];
  recordedTags: () => Record<string, unknown>;
  recordedContexts: () => Record<string, unknown>;
}

function sentrySetup(): AdapterSetup {
  const exceptions: RecordedException[] = [];
  const tags: Record<string, unknown> = {};
  const contexts: Record<string, unknown> = {};
  sentryCapture.mockImplementation((err: unknown) => {
    exceptions.push({ error: err });
    return '';
  });
  sentrySetTag.mockImplementation((key: string, value: unknown) => {
    tags[key] = value;
  });
  sentrySetContext.mockImplementation((name: string, context: unknown) => {
    contexts[name] = context;
  });
  return {
    adapter: createSentryErrorReporter(),
    recordedExceptions: () => exceptions,
    recordedTags: () => tags,
    recordedContexts: () => contexts,
  };
}

function inMemorySetup(): AdapterSetup {
  const state: InMemoryErrorReporterState = {};
  return {
    adapter: createInMemoryErrorReporter(state),
    recordedExceptions: () => state.exceptions ?? [],
    recordedTags: () => state.tags ?? {},
    recordedContexts: () => state.contexts ?? {},
  };
}

const adapters = [
  ['sentry', sentrySetup],
  ['in-memory', inMemorySetup],
] as const;

describe.each(adapters)('ErrorReporter (%s)', (_name, makeSetup) => {
  afterEach(() => {
    vi.clearAllMocks();
    sentryFlush.mockResolvedValue(true);
  });

  it('captures exceptions in order', () => {
    const { adapter, recordedExceptions } = makeSetup();
    const error = new Error('boom');
    adapter.captureException(error);
    expect(recordedExceptions()).toHaveLength(1);
    expect(recordedExceptions()[0].error).toBe(error);
  });

  it('records tags set via setTag', () => {
    const { adapter, recordedTags } = makeSetup();
    adapter.setTag('packageManager', 'pnpm');
    expect(recordedTags()).toEqual(expect.objectContaining({ packageManager: 'pnpm' }));
  });

  it('records contexts set via setContext', () => {
    const { adapter, recordedContexts } = makeSetup();
    adapter.setContext('build', { id: 'b-1' });
    expect(recordedContexts()).toEqual(expect.objectContaining({ build: { id: 'b-1' } }));
  });

  it('flushes pending reports on demand', async () => {
    const { adapter } = makeSetup();
    await expect(adapter.flush(2000)).resolves.toBe(true);
  });
});

import { readPackageUp } from 'read-package-up';
import { v4 as uuid } from 'uuid';

import { runAll } from '..';
import getEnvironment from '../lib/getEnvironment';
import { createLogger } from '../lib/log';
import parseArguments from '../lib/parseArguments';
import { createDefaultPorts, Ports } from '../lib/ports';
import { Context } from '../types';
import noPackageJson from '../ui/messages/errors/noPackageJson';
import { ChromaticConfig, PhaseName, PublishedBuild, RunEvent, RunResult, RunState } from './types';

interface ChromaticRunInput {
  config: ChromaticConfig;
  ports?: Partial<Ports>;
  onEvent?: (event: RunEvent) => void;
}

/**
 * Public entry point for executing a Chromatic build. Wraps the existing
 * task pipeline with a stable surface (`execute`/`state` + typed
 * {@link RunResult}/{@link RunEvent}) so phase code can be migrated off the
 * shared mutable Context one phase at a time.
 *
 * For now this delegates to `runAll`; over subsequent issues phases will be
 * ported to typed state slices and the class will own orchestration directly.
 */
export class ChromaticRun {
  private readonly config: ChromaticConfig;
  private readonly portsOverrides: Partial<Ports> | undefined;
  private readonly emit: ((event: RunEvent) => void) | undefined;
  private context: Context | undefined;
  private startWallClock = 0;
  private readonly phasesRun: PhaseName[] = [];

  constructor(input: ChromaticRunInput) {
    this.config = input.config;
    this.portsOverrides = input.ports;
    this.emit = input.onEvent;
  }

  async execute(signal?: AbortSignal): Promise<RunResult> {
    this.startWallClock = Date.now();
    this.context = await this.buildContext(signal);
    await runAll(this.context);
    return this.toResult(this.context);
  }

  get state(): RunState {
    if (!this.context) {
      throw new Error('ChromaticRun.state is unavailable until execute() has run.');
    }
    return Object.freeze({ ...this.context }) as RunState;
  }

  // eslint-disable-next-line complexity
  private async buildContext(signal?: AbortSignal): Promise<Context> {
    const argv = this.config.argv ?? [];
    const parsed = parseArguments(argv);
    const flags = this.config.flags ?? parsed.flags;
    const extraOptions = this.config.extraOptions;

    const sessionId = extraOptions?.sessionId ?? uuid();
    const environment = extraOptions?.env ?? getEnvironment();
    const log = extraOptions?.log ?? createLogger(flags, extraOptions);

    const packageInfo = await readPackageUp({ cwd: process.cwd(), normalize: false });
    if (!packageInfo) {
      throw new Error(noPackageJson());
    }

    const wrappedExtraOptions = {
      ...extraOptions,
      ...(signal && { experimental_abortSignal: signal }),
      experimental_onTaskStart: this.wrapStart(extraOptions?.experimental_onTaskStart),
      experimental_onTaskComplete: this.wrapComplete(extraOptions?.experimental_onTaskComplete),
    };

    const context: Partial<Context> & { ports?: Ports } = {
      argv: parsed.argv,
      flags,
      help: parsed.help,
      pkg: parsed.pkg as Context['pkg'],
      extraOptions: wrappedExtraOptions,
      packagePath: packageInfo.path,
      packageJson: packageInfo.packageJson,
      env: environment,
      log,
      sessionId,
    };
    context.ports = {
      ...createDefaultPorts({
        log,
        getGraphQLClient: () => (context as Context).client,
        getHttpClient: () => (context as Context).http,
        cliTokenEndpoint: `${environment.CHROMATIC_INDEX_URL}/api`,
      }),
      ...this.portsOverrides,
    };
    return context as Context;
  }

  private wrapStart(original?: (context: Context) => void) {
    return (taskContext: Context) => {
      original?.(taskContext);
      const phase = taskContext.task as PhaseName;
      if (!this.phasesRun.includes(phase)) this.phasesRun.push(phase);
      this.emit?.({ type: 'phase:start', phase, title: taskContext.title });
    };
  }

  private wrapComplete(original?: (context: Context) => void) {
    return (taskContext: Context) => {
      original?.(taskContext);
      const phase = taskContext.task as PhaseName;
      const startedAt = taskContext.startedAt ?? Date.now();
      this.emit?.({
        type: 'phase:end',
        phase,
        durationMs: Date.now() - startedAt,
        skipped: false,
      });
    };
  }

  private toResult(context: Context): RunResult {
    return {
      exitCode: context.exitCode,
      exitCodeKey: context.exitCodeKey,
      build: projectBuild(context),
      storybookUrl: context.build?.storybookUrl ?? context.storybookUrl,
      errors: Object.freeze([...(context.runtimeErrors ?? [])]),
      warnings: Object.freeze([...(context.runtimeWarnings ?? [])]),
      diagnostics: {
        sessionId: context.sessionId,
        durationMs: Date.now() - this.startWallClock,
        phasesRun: Object.freeze([...this.phasesRun]),
        reportPath: context.reportPath,
      },
    };
  }
}

function projectBuild(context: Context): PublishedBuild | undefined {
  const primary = context.build;
  const fallback = context.rebuildForBuild;
  if (!primary && !fallback) return undefined;

  const pick = <K extends keyof PublishedBuild>(key: K): PublishedBuild[K] => {
    const fromPrimary = primary?.[key as keyof typeof primary];
    if (fromPrimary !== undefined) return fromPrimary as PublishedBuild[K];
    return fallback?.[key as keyof typeof fallback] as PublishedBuild[K];
  };

  return {
    id: pick('id'),
    number: pick('number'),
    status: pick('status'),
    webUrl: pick('webUrl'),
    storybookUrl: pick('storybookUrl'),
    specCount: pick('specCount'),
    componentCount: pick('componentCount'),
    testCount: pick('testCount'),
    changeCount: pick('changeCount'),
    errorCount: pick('errorCount'),
    interactionTestFailuresCount: pick('interactionTestFailuresCount'),
    actualTestCount: pick('actualTestCount'),
    actualCaptureCount: pick('actualCaptureCount'),
    inheritedCaptureCount: pick('inheritedCaptureCount'),
  };
}

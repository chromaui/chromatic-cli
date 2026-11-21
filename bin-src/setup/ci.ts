import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Document, isMap, isScalar, isSeq, parseDocument } from 'yaml';

import { CI_PROVIDERS, CiProvider } from './detect';

/** One CI job that runs Chromatic, read from the parsed pipeline rather than its text. */
export interface ChromaticRun {
  provider: CiProvider;
  /** The CI file, relative to the repository root. */
  file: string;
  /** The job's name, such as "chromatic". */
  job: string;
  /** Where the job runs Chromatic from, relative to the repository root, or '.'. */
  directory: string;
  /** Whether the job clones full history; undefined when the provider gives no way to tell. */
  fullHistory?: boolean;
  /** Whether the workflow runs on pull_request (GitHub only). */
  onPullRequest?: boolean;
  /** Whether the step that runs Chromatic turns TurboSnap on. */
  onlyChanged: boolean;
  /** The CI file with full history turned on for this job, when that can be written safely. */
  fullHistoryFix?: string;
}

/** Each provider's config files, found by name. */
export interface DetectedCi {
  provider: CiProvider;
  files: string[];
}

// A command that runs the chromatic binary, as the first word of a shell command.
const CHROMATIC_COMMAND =
  /(?:^|&&|\|\||;|\|)\s*(?:npx\s+(?:-y\s+)?|pnpm\s+(?:dlx\s+|exec\s+)?|yarn\s+(?:dlx\s+)?|bunx\s+|bun\s+run\s+|npm\s+(?:run|exec)\s+(?:--\s+)?)?chromatic(?:@\S+)?(?=\s|$|;|&|\|)/m;
const ONLY_CHANGED_FLAG = /--only-changed(?!=false)(?=[\s=]|$)/;
const GITLAB_RESERVED = new Set([
  'stages',
  'variables',
  'default',
  'include',
  'workflow',
  'image',
  'services',
  'before_script',
  'after_script',
  'cache',
]);

/**
 * Finds each documented CI provider's config files by name.
 *
 * @param files Repository files relative to the git root.
 *
 * @returns Every documented provider, with the config files found for each.
 */
export function detectCi(files: string[]): DetectedCi[] {
  return CI_PROVIDERS.map((provider) => ({
    provider,
    files: files.filter((file) => provider.patterns.some((p) => p.test(file))),
  }));
}

/**
 * Normalizes a directory from a pipeline, such as "./packages/ui/", to "packages/ui".
 *
 * @param directory The directory as the pipeline writes it, if any.
 *
 * @returns The directory relative to the repository root, or "." for the root.
 */
function normalizeDirectory(directory: string | undefined) {
  if (!directory) return '.';
  const normalized = path.posix.normalize(directory.trim()).replace(/\/$/, '');
  return normalized === '' ? '.' : normalized;
}

/**
 * Where a shell command runs chromatic from: the last `cd` before it, joined onto a base directory.
 *
 * @param command The shell command.
 * @param base The directory the command starts in, relative to the repository root.
 *
 * @returns The directory, or undefined when the command doesn't run chromatic.
 */
function runsChromaticFrom(command: string, base: string) {
  const match = CHROMATIC_COMMAND.exec(command);
  if (!match) return undefined;
  const before = command.slice(0, match.index + match[0].length);
  const cd = [...before.matchAll(/\bcd\s+(["']?)([^\s"';&|]+)\1/g)].at(-1)?.[2];
  return normalizeDirectory(cd ? path.posix.join(base === '.' ? '' : base, cd) : base);
}

const asText = (value: unknown) => (typeof value === 'string' ? value : undefined);
// Keep the user's layout: no padding inside [a, b], and long commands stay on one line.
const printYaml = (document: Document) =>
  document.toString({ flowCollectionPadding: false, lineWidth: 0 });

function commandsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => commandsOf(item));
  return typeof value === 'string' ? [value] : [];
}
const depthOf = (definition: any) => definition?.variables?.GIT_DEPTH;

function triggersOnPullRequest(triggers: unknown) {
  if (Array.isArray(triggers)) return triggers.includes('pull_request');
  if (typeof triggers === 'object' && triggers !== null) return 'pull_request' in triggers;
  return triggers === 'pull_request';
}

/**
 * Where one GitHub Actions step runs Chromatic from, and whether it passes --only-changed.
 *
 * @param step The step's definition.
 * @param jobDirectory The job's or workflow's default working directory.
 *
 * @returns The run, or undefined when the step doesn't run Chromatic.
 */
function githubStepRun(step: any, jobDirectory: unknown) {
  if (asText(step?.uses)?.startsWith('chromaui/action')) {
    const inputs = step.with ?? {};
    return {
      directory: normalizeDirectory(asText(inputs.workingDir)),
      onlyChanged: inputs.onlyChanged !== undefined && String(inputs.onlyChanged) !== 'false',
    };
  }
  const command = asText(step?.run);
  if (!command) return undefined;
  const directory = runsChromaticFrom(
    command,
    normalizeDirectory(asText(step['working-directory']) ?? asText(jobDirectory))
  );
  return directory ? { directory, onlyChanged: ONLY_CHANGED_FLAG.test(command) } : undefined;
}

/**
 * Whether a job's checkouts fetch full history, and the workflow with every shallow one fixed.
 *
 * @param raw The workflow file's text.
 * @param job The job's key.
 * @param steps The job's steps.
 *
 * @returns Undefined fullHistory when the job checks out nothing.
 */
function githubHistory(raw: string, job: string, steps: any[]) {
  const checkouts = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => asText(step?.uses)?.startsWith('actions/checkout'));
  const shallow = checkouts.filter(({ step }) => String(step.with?.['fetch-depth']) !== '0');
  if (shallow.length === 0) return { fullHistory: checkouts.length > 0 ? true : undefined };
  const fixed = parseDocument(raw);
  for (const { index } of shallow) {
    fixed.setIn(['jobs', job, 'steps', index, 'with', 'fetch-depth'], 0);
  }
  return { fullHistory: false, fullHistoryFix: printYaml(fixed) };
}

function githubRuns(provider: CiProvider, file: string, raw: string): ChromaticRun[] {
  const document = parseDocument(raw, { merge: true });
  const workflow = document.toJS() ?? {};
  const onPullRequest = triggersOnPullRequest(workflow.on ?? workflow.true);

  return Object.entries<any>(workflow.jobs ?? {}).flatMap(([job, definition]) => {
    const steps: any[] = Array.isArray(definition?.steps) ? definition.steps : [];
    const jobDirectory =
      definition?.defaults?.run?.['working-directory'] ??
      workflow.defaults?.run?.['working-directory'];
    const runs = steps
      .map((step) => githubStepRun(step, jobDirectory))
      .filter((run) => run !== undefined);
    if (runs.length === 0) return [];
    const history = githubHistory(raw, job, steps);
    return runs.map((run) => ({ provider, file, job, ...run, ...history, onPullRequest }));
  });
}

function gitlabRuns(provider: CiProvider, file: string, raw: string): ChromaticRun[] {
  const pipeline = parseDocument(raw, { merge: true }).toJS() ?? {};
  return Object.entries<any>(pipeline).flatMap(([job, definition]) => {
    if (GITLAB_RESERVED.has(job) || job.startsWith('.') || typeof definition !== 'object')
      return [];
    const commands = [...commandsOf(definition?.before_script), ...commandsOf(definition?.script)];
    // Scripts run in sequence, so a `cd` in an earlier line still applies.
    const directory = runsChromaticFrom(commands.join(' && '), '.');
    if (!directory) return [];
    const templates = commandsOf(definition.extends).map((name) => pipeline[name]);
    const depth = [definition, ...templates, pipeline]
      .map((source) => depthOf(source))
      .find((value) => value !== undefined);
    const fullHistory = depth !== undefined && String(depth) === '0';
    let fullHistoryFix: string | undefined;
    if (!fullHistory) {
      const fixed = parseDocument(raw);
      fixed.setIn([job, 'variables', 'GIT_DEPTH'], 0);
      fullHistoryFix = printYaml(fixed);
    }
    return [
      {
        provider,
        file,
        job,
        directory,
        fullHistory,
        onlyChanged: commands.some((command) => ONLY_CHANGED_FLAG.test(command)),
        fullHistoryFix,
      },
    ];
  });
}

/**
 * Every string in a parsed YAML node, with the path of keys that leads to it.
 *
 * @param node A node from parseDocument.
 * @param at The keys that lead to the node.
 *
 * @returns Each string value and its path.
 */
function stringsIn(node: unknown, at: string[] = []): { at: string[]; value: string }[] {
  if (isScalar(node)) return typeof node.value === 'string' ? [{ at, value: node.value }] : [];
  if (isSeq(node)) return node.items.flatMap((item, index) => stringsIn(item, [...at, `${index}`]));
  if (isMap(node)) {
    return node.items.flatMap((pair) =>
      stringsIn(pair.value, [...at, isScalar(pair.key) ? String(pair.key.value) : '?'])
    );
  }
  return [];
}

/**
 * For providers without a dedicated reader, any command in the pipeline that runs chromatic. The
 * job is the top-level key it sits under. Clone depth isn't checked for these.
 *
 * @param provider The CI provider.
 * @param file The CI file, relative to the repository root.
 * @param raw The file's contents.
 *
 * @returns One run per command that runs chromatic.
 */
function genericRuns(provider: CiProvider, file: string, raw: string): ChromaticRun[] {
  const commands =
    provider.id === 'jenkins'
      ? // Jenkinsfiles are Groovy, so read sh steps from the text, without // comments.
        [...raw.replaceAll(/\/\/.*$/gm, '').matchAll(/\bsh\s*\(?\s*(['"]{1,3})([\S\s]*?)\1/g)].map(
          (match) => ({ at: ['pipeline'], value: match[2] })
        )
      : stringsIn(parseDocument(raw).contents);
  return commands.flatMap(({ at, value }) => {
    const directory = runsChromaticFrom(value, '.');
    return directory
      ? [{ provider, file, job: at[0], directory, onlyChanged: ONLY_CHANGED_FLAG.test(value) }]
      : [];
  });
}

/**
 * Reads every CI file and lists the jobs that run Chromatic. A file that doesn't parse counts as
 * running nothing, as it can't run in CI either.
 *
 * @param gitRoot Absolute repository root.
 * @param files Repository files relative to the git root.
 *
 * @returns Each job that runs Chromatic.
 */
export function findChromaticRuns(gitRoot: string, files: string[]): ChromaticRun[] {
  return detectCi(files).flatMap(({ provider, files: found }) =>
    found.flatMap((file) => {
      try {
        const raw = readFileSync(path.join(gitRoot, file), 'utf8');
        if (provider.id === 'github') return githubRuns(provider, file, raw);
        if (provider.id === 'gitlab') return gitlabRuns(provider, file, raw);
        return genericRuns(provider, file, raw);
      } catch {
        return [];
      }
    })
  );
}

/**
 * The jobs that run Chromatic from one package's directory.
 *
 * @param runs Results from findChromaticRuns.
 * @param packageDirectory The package's path from the repository root, or '.'.
 *
 * @returns The matching jobs.
 */
export function runsFor(runs: ChromaticRun[], packageDirectory: string) {
  const wanted = normalizeDirectory(packageDirectory);
  return runs.filter((run) => run.directory === wanted);
}

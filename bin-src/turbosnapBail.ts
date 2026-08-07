import { traceChangedFiles } from '@cli/turbosnap/v2';
import { readJson } from 'fs-extra';
import meow from 'meow';
import path from 'path';

import GraphQLClient from '../node-src/io/graphqlClient';
import { SBProjectJson } from '../node-src/lib/getPrebuiltStorybookMetadata';
import { createLogger } from '../node-src/lib/log';
import { ProjectFiles, realProjectFiles } from '../node-src/lib/turbosnap/v2/projectFiles';
import {
  readTurbosnapInput,
  TURBOSNAP_INPUT_OPTIONS_HELP,
  turbosnapInputFlags,
} from './turbosnapInput';

/**
 * Utility to run TurboSnap v2's guards against a preview-stats.json and print the bail they produce,
 * or the absence of one, to stdout as JSON.
 *
 * `chromatic turbosnap-manifest` builds the manifest directly, so it exercises none of v2's bails —
 * which leaves the bail behaviour of a new builder or project layout unmeasurable locally. This runs
 * the production `traceChangedFiles` instead, with a stub Index client, so every guard fires exactly
 * as it would during a build and only the network is faked.
 *
 * Command:
 *   chromatic turbosnap-bail [-s|--stats-file] [-b|--storybook-base-dir] [-c|--config-dir]
 *                            [--static-dir] [--build-script-name] [--project-json] [--builder-name]
 *
 * The input is derived exactly as `turbosnap-manifest` derives it, so the two commands describe the
 * same run. Two extra flags exist for probing layouts a checkout cannot produce on its own:
 *
 *   --stats-file accepts a synthetically transformed stats file, and --project-json then points back
 *   at the real build's metadata, which no longer sits beside it.
 *   --builder-name overrides the builder the anchor check is told the project declares, without
 *   editing the project's Storybook config.
 *
 * A stub Index client always answers with a well-formed success, so the transport and contract bails
 * (`indexUnavailable`, `indexContractViolation`) are deliberately unreachable here: they say nothing
 * about a builder or a layout. Every stats-shaped and emptiness bail is reachable.
 *
 * The verdict names the builder generation that produced the stats, because a bail on one generation
 * of a builder says nothing about another. It also reports the diagnostic manifest v2 writes on its
 * way past the guards, so a wrong-but-safe bail can be read against the graph that caused it.
 */

/** The status `traceChangedFiles` returns when no bail fired and the hash upload was reached. */
const TRACED_STATUSES = new Set(['fallback', 'traced']);

/**
 * The main entrypoint for `chromatic turbosnap-bail`.
 *
 * @param argv A list of arguments passed.
 */
export async function main(argv: string[]) {
  const { flags } = meow(
    `
    Usage
      $ chromatic turbosnap-bail [-s|--stats-file] [-b|--storybook-base-dir] [-c|--config-dir] [--static-dir] [--build-script-name] [--project-json] [--builder-name]

    Options
${TURBOSNAP_INPUT_OPTIONS_HELP}
      --project-json <filepath>             Path to the prebuilt Storybook's project.json, which names the builder and whether static directories were declared. (default: alongside the stats file)
      --builder-name <name>                 Builder the anchor check is told the project declares. (default: project.json's)
    `,
    {
      argv,
      description: "Report the bail TurboSnap v2's guards produce for a stats file",
      flags: {
        ...turbosnapInputFlags,
        projectJson: { type: 'string' },
        builderName: { type: 'string' },
      },
    }
  );

  // Errors go to stderr (console.error); at this level info/debug logs are suppressed so the
  // verdict JSON is the only thing on stdout.
  const log = createLogger({}, { logPrefix: '', logLevel: 'error' });

  try {
    const input = await readTurbosnapInput(flags, log);
    const projectJsonPath =
      flags.projectJson ?? path.join(path.dirname(input.statsPath), 'project.json');
    const prebuilt = await readProjectJson(projectJsonPath);
    const builderName = flags.builderName ?? readBuilderName(prebuilt);

    // Production writes the diagnostic manifest under the prebuilt Storybook it is tracing; keep it
    // there so this command leaves the same artifact in the same place a build would.
    const manifestOutputDirectory = path.join(path.dirname(input.statsPath), '.chromatic');

    const staticDirectoriesDeclared = prebuilt?.hasStaticDirs ?? false;
    const index = stubIndexClient();
    const projectFiles = realProjectFiles();
    const result = await traceChangedFiles({
      graphqlClient: index.graphqlClient,
      buildId: 'turbosnap-bail',
      stats: input.stats,
      statsPath: input.statsPath,
      manifestOutputDirectory,
      repositoryRoot: input.repositoryRoot,
      projectRoot: input.projectRoot,
      configDir: input.configDir,
      staticDirs: input.staticDirs,
      staticDirsDeclared: staticDirectoriesDeclared,
      projectFiles,
      ...(builderName && { builderName }),
    });

    process.stdout.write(
      JSON.stringify({
        status: result.status,
        ...('turboSnap' in result && { bailReason: result.turboSnap.bailReason }),
        // Whether the run got as far as offering its hashes to the Index, which is the only
        // observable difference between "no bail fired" and "a bail fired after the guards".
        reachedIndexUpload: index.wasCalled(),
        statsFile: input.statsPath,
        projectRoot: input.projectRoot,
        configDir: input.configDir,
        staticDirs: input.staticDirs,
        staticDirsDeclared: staticDirectoriesDeclared,
        storybook: describeStorybook({
          prebuilt,
          projectJsonPath,
          projectRoot: input.projectRoot,
          projectFiles,
          builderName,
          builderNameFromFlag: Boolean(flags.builderName),
        }),
        manifestFile: path.join(manifestOutputDirectory, 'turbosnap-manifest.json'),
      })
    );

    // A bail is the measurement, not a failure of this command, so the exit code reports only
    // whether the guards let the run through.
    if (!TRACED_STATUSES.has(result.status)) process.exitCode = 1;
  } catch (err) {
    log.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

/**
 * An Index client that answers the hash upload with a well-formed success and records that it was
 * asked. Faking the network is what makes every guard before it observable locally; answering
 * anything other than success would fabricate a bail that says nothing about the stats.
 *
 * @returns The stub client and whether it was called.
 */
function stubIndexClient() {
  let called = false;
  const client = {
    runQuery: async () => {
      called = true;
      return {
        buildUploadHashes: {
          build: { turboSnapStatus: 'APPLIED', turboSnapMechanism: 'HASH_BASED' },
        },
      };
    },
  };

  return {
    graphqlClient: client as unknown as GraphQLClient,
    wasCalled: () => called,
  };
}

async function readProjectJson(projectJsonPath: string): Promise<SBProjectJson | undefined> {
  try {
    return await readJson(projectJsonPath);
  } catch {
    return undefined;
  }
}

/**
 * The builder the prebuilt Storybook records, taken verbatim.
 *
 * Deliberately without `getStorybookMetadataFromProjectJson`'s Storybook 6 `webpack4` default: this
 * command exists to attest what produced a stats file, and a default would name a builder the build
 * never used — in exactly the case the attestation matters.
 *
 * @param prebuilt The prebuilt Storybook's project.json, when it could be read.
 *
 * @returns The declared builder name, or undefined when it declares none.
 */
function readBuilderName(prebuilt?: SBProjectJson): string | undefined {
  const { builder } = prebuilt ?? {};
  return typeof builder === 'string' ? builder : builder?.name;
}

interface StorybookProvenance {
  prebuilt?: SBProjectJson;
  projectJsonPath: string;
  projectRoot: string;
  projectFiles: ProjectFiles;
  builderName?: string;
  builderNameFromFlag: boolean;
}

/**
 * Names the builder generation that produced these stats. The builder and framework packages are
 * both reported because neither alone pins every generation: the rsbuild builder is absent from some
 * project.json files whose framework package version is the only record of it.
 *
 * Every field that says where a value came from is always present, so a row assembled from a
 * project.json that could not be read cannot be mistaken for a measured one.
 *
 * @param provenance Everything known about where the stats came from.
 * @param provenance.prebuilt The prebuilt Storybook's project.json, when it could be read.
 * @param provenance.projectJsonPath The path it was looked for at.
 * @param provenance.projectRoot The project root package versions resolve from.
 * @param provenance.projectFiles How to read the disk.
 * @param provenance.builderName The builder the anchor check was told about.
 * @param provenance.builderNameFromFlag Whether that builder came from `--builder-name`.
 *
 * @returns The provenance of the stats file.
 */
function describeStorybook({
  prebuilt,
  projectJsonPath,
  projectRoot,
  projectFiles,
  builderName,
  builderNameFromFlag,
}: StorybookProvenance) {
  return {
    projectJson: projectJsonPath,
    projectJsonFound: Boolean(prebuilt),
    builderSource: builderSourceOf(builderName, builderNameFromFlag),
    ...(prebuilt?.storybookVersion && { version: prebuilt.storybookVersion }),
    builder: describePackage(builderName, prebuilt, projectRoot, projectFiles),
    framework: describePackage(prebuilt?.framework?.name, prebuilt, projectRoot, projectFiles),
  };
}

function builderSourceOf(builderName: string | undefined, builderNameFromFlag: boolean) {
  if (!builderName) return 'unrecorded';
  return builderNameFromFlag ? 'flag' : 'project.json';
}

/**
 * A package's installed version, preferring what is on disk under the project root over what
 * project.json recorded, because the anchor and builder checks resolve from disk too. Keys are
 * omitted rather than emptied, so `builderSource` remains the only thing that says what is known.
 */
function describePackage(
  packageName: string | undefined,
  prebuilt: SBProjectJson | undefined,
  projectRoot: string,
  projectFiles: ProjectFiles
) {
  if (!packageName) return {};

  const version =
    projectFiles.packageVersion(projectRoot, packageName) ??
    prebuilt?.storybookPackages?.[packageName]?.version;

  return { name: packageName, ...(version && { version }) };
}

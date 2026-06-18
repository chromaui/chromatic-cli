import { createReadStream, mkdirSync, type WriteStream } from 'fs';
import path from 'path';
import { createInterface } from 'readline';

import { openLogFileStream } from '../../lib/logFile';
import { buildAndroid, buildIos, execWithBuildEnvironment } from '../../lib/react-native/build';
import { readExpoConfig } from '../../lib/react-native/expoConfig';
import { generateManifest } from '../../lib/react-native/generateManifest';
import { exitCodes, TaskFailure } from '../../lib/setExitCode';
import { Context, Deps } from '../../types';
import { reactNativeBuildFailed } from '../../ui/messages/errors/buildFailed';
import { failedNoValidPlatforms, pendingAndroid, pendingIOS } from '../../ui/tasks/buildReactNative';

type BuildReactNativeDeps = Pick<Deps, 'options' | 'log' | 'report'>;

interface BuildArtifactsInput {
  sourceDir: string;
  browsers?: string[];
  runtimeMetadata?: Context['runtimeMetadata'];
}

interface BuildArtifactsOutput {
  reactNativeBuildLogFile: string;
}

const MAX_REACT_NATIVE_LOG_LINES = 20;

async function readLastLines(filePath: string, lineCount: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const buffer: string[] = [];
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    rl.on('line', (line) => {
      buffer.push(line);
      if (buffer.length > lineCount) buffer.shift();
    });
    rl.on('close', () => resolve(buffer.join('\n')));
    rl.on('error', reject);
  });
}

const runPlatformCommand = async (
  deps: BuildReactNativeDeps,
  sourceDir: string,
  command: string,
  logStream: WriteStream
) => {
  deps.log.debug('Running React Native build command:', command);
  try {
    await execWithBuildEnvironment(
      command,
      [],
      { env: { CHROMATIC_ARTIFACT_DIRECTORY: sourceDir } },
      logStream
    );
  } catch (err) {
    throw new Error(`React Native build command failed: ${command}\n${err.message}`);
  }
};

const resolvePlatforms = (browsers?: string[]) => {
  return (browsers ?? []).filter(
    (b): b is 'ios' | 'android' => b === 'ios' || b === 'android'
  );
};

const buildAndroidArtifact = async (
  deps: BuildReactNativeDeps,
  sourceDir: string,
  logStream: WriteStream
) => {
  const { title, output } = pendingAndroid(deps.options.reactNative);
  deps.report({ title, output });
  const { androidBuildCommand, androidBuildArchitectures } = deps.options.reactNative ?? {};
  deps.log.debug({ androidBuildCommand }, 'Running Android build');
  if (androidBuildCommand) {
    if (androidBuildArchitectures?.length) {
      deps.log.debug('androidBuildArchitectures is ignored when androidBuildCommand is set');
    }
    await runPlatformCommand(deps, sourceDir, androidBuildCommand, logStream);
  } else {
    await buildAndroid(path.join(sourceDir, 'storybook.apk'), logStream, androidBuildArchitectures);
  }
};

const buildIosArtifact = async (
  deps: BuildReactNativeDeps,
  sourceDir: string,
  logStream: WriteStream
) => {
  const { title, output } = pendingIOS(deps.options.reactNative);
  deps.report({ title, output });
  const { iosBuildCommand } = deps.options.reactNative ?? {};
  deps.log.debug({ iosBuildCommand }, 'Running iOS build');
  if (iosBuildCommand) {
    await runPlatformCommand(deps, sourceDir, iosBuildCommand, logStream);
  } else {
    const config = await readExpoConfig();
    await buildIos(config.name, path.join(sourceDir, 'storybook.app'), logStream);
  }
};

export const buildArtifacts = async (
  deps: BuildReactNativeDeps,
  input: BuildArtifactsInput
): Promise<BuildArtifactsOutput> => {
  const platforms = resolvePlatforms(input.browsers);
  const needsAndroid = platforms.includes('android');
  const needsIos = platforms.includes('ios');

  if (!needsAndroid && !needsIos) {
    deps.log.debug('No supported platforms found for React Native build:', platforms);
    throw new TaskFailure(failedNoValidPlatforms().output, {
      exitCode: exitCodes.NPM_BUILD_STORYBOOK_FAILED,
      userError: true,
    });
  }

  mkdirSync(path.join(input.sourceDir, '.chromatic'), { recursive: true });
  const reactNativeBuildLogFile = path.join(input.sourceDir, '.chromatic', 'react-native-build.log');

  const logStream = await openLogFileStream(reactNativeBuildLogFile);

  try {
    if (needsAndroid) await buildAndroidArtifact(deps, input.sourceDir, logStream);
    if (needsIos) await buildIosArtifact(deps, input.sourceDir, logStream);
    await new Promise<void>((resolve) => logStream.end(resolve));
  } catch (buildError) {
    await new Promise<void>((resolve) => logStream.end(resolve));
    const tail = await readLastLines(reactNativeBuildLogFile, MAX_REACT_NATIVE_LOG_LINES);
    deps.log.error(
      reactNativeBuildFailed(
        { reactNativeBuildLogFile, runtimeMetadata: input.runtimeMetadata },
        buildError,
        tail
      )
    );
    throw new TaskFailure(`Build failed, see logs at ${reactNativeBuildLogFile}`, {
      exitCode: exitCodes.NPM_BUILD_STORYBOOK_FAILED,
      userError: true,
    });
  }

  return { reactNativeBuildLogFile };
};

export const generateManifestStep = async (
  deps: Pick<Deps, 'options' | 'log'>,
  input: { sourceDir: string }
) => {
  deps.log.debug('Generating manifest.json file for React Native build');
  return await generateManifest(deps, { sourceDir: input.sourceDir });
};

import { createReadStream, mkdirSync, type WriteStream } from 'fs';
import path from 'path';
import { createInterface } from 'readline';

import { openLogFileStream } from '../../lib/logFile';
import { buildAndroid, buildIos, execWithBuildEnvironment } from '../../lib/react-native/build';
import { readExpoConfig } from '../../lib/react-native/expoConfig';
import { generateManifest } from '../../lib/react-native/generateManifest';
import { exitCodes, setExitCode } from '../../lib/setExitCode';
import { transitionTo } from '../../lib/tasks';
import { Context, Task } from '../../types';
import { reactNativeBuildFailed } from '../../ui/messages/errors/buildFailed';
import {
  failed,
  failedNoValidPlatforms,
  pendingAndroid,
  pendingIOS,
} from '../../ui/tasks/buildReactNative';

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

const runPlatformCommand = async (ctx: Context, command: string, logStream: WriteStream) => {
  ctx.log.debug('Running React Native build command:', command);
  try {
    await execWithBuildEnvironment(
      command,
      [],
      { env: { CHROMATIC_ARTIFACT_DIRECTORY: ctx.sourceDir } },
      logStream
    );
  } catch (err) {
    throw new Error(`React Native build command failed: ${command}\n${err.message}`);
  }
};

const resolvePlatforms = (ctx: Context) => {
  return (ctx.announcedBuild?.browsers ?? []).filter(
    (b): b is 'ios' | 'android' => b === 'ios' || b === 'android'
  );
};

const buildAndroidArtifact = async (ctx: Context, task: Task, logStream: WriteStream) => {
  transitionTo(pendingAndroid)(ctx, task);
  const { androidBuildCommand, androidBuildArchitectures } = ctx.options.reactNative ?? {};
  ctx.log.debug({ androidBuildCommand }, 'Running Android build');
  if (androidBuildCommand) {
    if (androidBuildArchitectures?.length) {
      ctx.log.debug('androidBuildArchitectures is ignored when androidBuildCommand is set');
    }
    await runPlatformCommand(ctx, androidBuildCommand, logStream);
  } else {
    await buildAndroid(
      path.join(ctx.sourceDir, 'storybook.apk'),
      logStream,
      androidBuildArchitectures
    );
  }
};

const buildIosArtifact = async (ctx: Context, task: Task, logStream: WriteStream) => {
  transitionTo(pendingIOS)(ctx, task);
  const { iosBuildCommand } = ctx.options.reactNative ?? {};
  ctx.log.debug({ iosBuildCommand }, 'Running iOS build');
  if (iosBuildCommand) {
    await runPlatformCommand(ctx, iosBuildCommand, logStream);
  } else {
    const config = await readExpoConfig();
    await buildIos(config.name, path.join(ctx.sourceDir, 'storybook.app'), logStream);
  }
};

export const buildArtifacts = async (ctx: Context, task: Task) => {
  const platforms = resolvePlatforms(ctx);
  const needsAndroid = platforms.includes('android');
  const needsIos = platforms.includes('ios');

  if (!needsAndroid && !needsIos) {
    setExitCode(ctx, exitCodes.NPM_BUILD_STORYBOOK_FAILED, true);
    ctx.log.debug('No supported platforms found for React Native build:', platforms);
    throw new Error(failedNoValidPlatforms().output);
  }

  mkdirSync(path.join(ctx.sourceDir, '.chromatic'), { recursive: true });
  ctx.reactNativeBuildLogFile = path.join(ctx.sourceDir, '.chromatic', 'react-native-build.log');

  const logStream = await openLogFileStream(ctx.reactNativeBuildLogFile);

  try {
    if (needsAndroid) await buildAndroidArtifact(ctx, task, logStream);
    if (needsIos) await buildIosArtifact(ctx, task, logStream);
    await new Promise<void>((resolve) => logStream.end(resolve));
  } catch (buildError) {
    setExitCode(ctx, exitCodes.NPM_BUILD_STORYBOOK_FAILED, true);
    await new Promise<void>((resolve) => logStream.end(resolve));
    const tail = await readLastLines(ctx.reactNativeBuildLogFile, MAX_REACT_NATIVE_LOG_LINES);
    ctx.log.error(reactNativeBuildFailed(ctx, buildError, tail));
    throw new Error(failed(ctx).output);
  }
};

export const generateManifestStep = async (ctx: Context) => {
  ctx.log.debug('Generating manifest.json file for React Native build');
  return await generateManifest(ctx);
};

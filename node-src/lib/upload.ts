import { Context, FileDesc, TargetInfo } from '../types';
import { maxFileCountExceeded } from '../ui/messages/errors/maxFileCountExceeded';
import { maxFileSizeExceeded } from '../ui/messages/errors/maxFileSizeExceeded';
import { uploadFailed } from '../ui/messages/errors/uploadFailed';
import makeZipFile from './compress';
import { uploadFiles } from './uploadFiles';
import { uploadZip } from './uploadZip';

// This limit is imposed by the uploadBuild mutation
const MAX_FILES_PER_REQUEST = 1000;

const UploadBuildMutation = `
  mutation UploadBuildMutation($buildId: ObjID!, $files: [FileUploadInput!]!, $zip: Boolean) {
    uploadBuild(buildId: $buildId, files: $files, zip: $zip) {
      info {
        sentinelUrls
        targets {
          contentType
          fileKey
          filePath
          formAction
          formFields
        }
        zipTarget {
          contentType
          fileKey
          filePath
          formAction
          formFields
        }
      }
      userErrors {
        __typename
        ... on UserError {
          message
        }
        ... on MaxFileCountExceededError {
          maxFileCount
          fileCount
        }
        ... on MaxFileSizeExceededError {
          maxFileSize
          filePaths
        }
      }
    }
  }
`;

interface UploadBuildMutationResult {
  uploadBuild: {
    info?: {
      sentinelUrls: string[];
      targets: TargetInfo[];
      zipTarget?: TargetInfo;
    };
    userErrors: (
      | {
          __typename: 'UserError';
          message: string;
        }
      | {
          __typename: 'MaxFileCountExceededError';
          message: string;
          maxFileCount: number;
          fileCount: number;
        }
      | {
          __typename: 'MaxFileSizeExceededError';
          message: string;
          maxFileSize: number;
          filePaths: string[];
        }
    )[];
  };
}

/**
 * Filter bundle files based on browser requirements for React Native builds.
 * Only includes storybook.apk if 'android' is in the browser list.
 * Only includes storybook.app if 'ios' is in the browser list.
 *
 * @param ctx The context for logging.
 * @param files The list of files to filter.
 * @param browsers The list of target browsers.
 *
 * @returns Filtered list of files to upload.
 */
function filterBundleFilesByBrowser(
  ctx: Context,
  files: FileDesc[],
  browsers: string[] = []
): FileDesc[] {
  const hasAndroid = browsers.includes('android');
  const hasIOS = browsers.includes('ios');
  const filteredBundles = new Set<string>();

  const filteredFiles = files.filter((file) => {
    // Filter out storybook.apk if android is not in browser list
    if (!hasAndroid && file.targetPath === 'storybook.apk') {
      filteredBundles.add(file.targetPath);
      return false;
    }

    // Filter out storybook.app if ios is not in browser list
    // storybook.app is a directory, so paths will be like "storybook.app/modules.json"
    if (!hasIOS && file.targetPath.startsWith('storybook.app/')) {
      filteredBundles.add('storybook.app');
      return false;
    }

    // Keep all other files (manifest.json, etc.)
    return true;
  });

  if (filteredBundles.size > 0) {
    ctx.log.debug(
      `Filtered bundle files based on browser requirements: ${[...filteredBundles].join(', ')}`
    );
  }

  return filteredFiles;
}

/**
 * Upload build files to Chromatic.
 *
 * @param ctx The context set when executing the CLI.
 * @param files The list of files to upload.
 * @param options A collection of callbacks for each stage of the upload.
 * @param options.onStart A callback for when the build upload starts.
 * @param options.onProgress A callback to track progress of the upload.
 * @param options.onComplete A callback for when the build upload completes.
 * @param options.onError A callback for when the build upload errors.
 *
 * @returns A promise that resolves when the build is uploaded to Chromatic.
 */
// TODO: refactor this function
// eslint-disable-next-line complexity, max-statements
export async function uploadBuild(
  ctx: Context,
  files: FileDesc[],
  options: {
    onStart?: () => void;
    onProgress?: (progress: number, total: number) => void;
    onComplete?: (uploadedBytes: number, uploadedFiles: number, sentinelUrls: string[]) => void;
    onError?: (error: Error, path?: string) => void;
  } = {}
) {
  ctx.sentinelUrls = [];
  ctx.uploadedBytes = 0;
  ctx.uploadedFiles = 0;

  const targets: (TargetInfo & FileDesc)[] = [];
  let zipTarget: TargetInfo | undefined;

  // Filter files based on browser requirements
  const browsers = ctx.announcedBuild?.browsers || [];
  const filteredFiles = ctx.isReactNativeApp
    ? filterBundleFilesByBrowser(ctx, files, browsers)
    : files;

  const batches: FileDesc[][] = [];
  for (const [fileIndex, file] of filteredFiles.entries()) {
    const batchIndex = Math.floor(fileIndex / MAX_FILES_PER_REQUEST);
    if (!batches[batchIndex]) {
      batches[batchIndex] = [];
    }
    batches[batchIndex].push(file);
  }

  // The uploadBuild mutation has to run in batches to avoid hitting request/response payload limits
  // or running out of memory. These run sequentially to avoid too many concurrent requests.
  // The uploading itself still happens without batching, since it has its own concurrency limiter.
  for (const [index, batch] of batches.entries()) {
    ctx.log.debug(`Running uploadBuild batch ${index + 1} / ${batches.length}`);

    const { uploadBuild } = await ctx.client.runQuery<UploadBuildMutationResult>(
      UploadBuildMutation,
      {
        buildId: ctx.announcedBuild.id,
        files: batch.map(({ contentHash, contentLength, targetPath }) => ({
          contentHash,
          contentLength,
          filePath: targetPath,
        })),
        zip: ctx.options.zip,
      }
    );

    if (uploadBuild.userErrors.length > 0) {
      for (const err of uploadBuild.userErrors) {
        if (err.__typename === 'MaxFileCountExceededError') {
          ctx.log.error(maxFileCountExceeded(err));
        } else if (err.__typename === 'MaxFileSizeExceededError') {
          ctx.log.error(maxFileSizeExceeded(err));
        } else {
          ctx.log.error(err.message);
        }
      }
      return options.onError?.(new Error('Upload rejected due to user error'));
    }

    ctx.sentinelUrls.push(...(uploadBuild.info?.sentinelUrls || []));
    targets.push(
      ...(uploadBuild.info?.targets.map((target) => {
        const file = batch.find((f) => f.targetPath === target.filePath);
        return { ...file, ...target } as FileDesc & TargetInfo;
      }) || [])
    );

    // Use the last received zipTarget, as it will have the largest allowed size.
    // If all files in the batch are copied rather than uploaded, we won't receive a zipTarget.
    if (uploadBuild.info?.zipTarget) {
      zipTarget = uploadBuild.info.zipTarget;
    }
  }

  if (targets.length === 0) {
    ctx.log.debug('No new files to upload, continuing');
    return;
  }

  // Uploading zero-length files is valid, so this might add up to 0.
  const totalBytes = targets.reduce((sum, { contentLength }) => sum + contentLength, 0);

  if (zipTarget) {
    try {
      const { path, size } = await makeZipFile(ctx, targets);
      const compressionRate = totalBytes && (totalBytes - size) / totalBytes;
      ctx.log.debug(`Compression reduced upload size by ${Math.round(compressionRate * 100)}%`);

      const target = { ...zipTarget, contentLength: size, localPath: path };
      await uploadZip(ctx, target, (progress) => options.onProgress?.(progress, size));
      ctx.uploadedBytes += size;
      ctx.uploadedFiles += targets.length;
      return;
    } catch (err) {
      ctx.log.debug({ err }, 'Error uploading zip, falling back to uploading individual files');
    }
  }

  try {
    await uploadFiles(ctx, targets, (progress) => options.onProgress?.(progress, totalBytes));
    ctx.uploadedBytes += totalBytes;
    ctx.uploadedFiles += targets.length;
  } catch (err) {
    const target = targets.find((target) => target.localPath === err.message);
    if (target) ctx.log.error(uploadFailed({ target }, ctx.log.getLevel() === 'debug'));
    return options.onError?.(err, target?.localPath);
  }
}

const UploadMetadataMutation = `
  mutation UploadMetadataMutation($buildId: ObjID!, $files: [FileUploadInput!]!) {
    uploadMetadata(buildId: $buildId, files: $files) {
      info {
        targets {
          contentType
          fileKey
          filePath
          formAction
          formFields
        }
      }
      userErrors {
        ... on UserError {
          message
        }
      }
    }
  }
`;

interface UploadMetadataMutationResult {
  uploadMetadata: {
    info?: {
      targets: TargetInfo[];
    };
    userErrors: {
      message: string;
    }[];
  };
}

/**
 * Upload metadata files to Chromatic for debugging issues with Chromatic support.
 *
 * @param ctx The context set when executing the CLI.
 * @param files The list of metadata files to upload.
 *
 * @returns A promise that resolves when all metadata files are uploaded.
 */
export async function uploadMetadata(ctx: Context, files: FileDesc[]) {
  const { uploadMetadata } = await ctx.client.runQuery<UploadMetadataMutationResult>(
    UploadMetadataMutation,
    {
      buildId: ctx.announcedBuild.id,
      files: files.map(({ contentHash, contentLength, targetPath }) => ({
        contentHash,
        contentLength,
        filePath: targetPath,
      })),
    }
  );

  if (uploadMetadata.info) {
    const targets = uploadMetadata.info.targets.map((target) => {
      const file = files.find((f) => f.targetPath === target.filePath);
      return { ...file, ...target } as FileDesc & TargetInfo;
    });
    await uploadFiles(ctx, targets);
  }

  if (uploadMetadata.userErrors.length > 0) {
    uploadMetadata.userErrors.map((err) => ctx.log.warn(err.message));
  }
}

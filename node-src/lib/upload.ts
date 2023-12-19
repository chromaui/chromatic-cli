import makeZipFile from './compress';
import { uploadZip } from './uploadZip';
import { uploadFiles } from './uploadFiles';
import { Context, FileDesc, TargetInfo } from '../types';
import { maxFileCountExceeded } from '../ui/messages/errors/maxFileCountExceeded';
import { maxFileSizeExceeded } from '../ui/messages/errors/maxFileSizeExceeded';

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
  const { uploadBuild } = await ctx.client.runQuery<UploadBuildMutationResult>(
    UploadBuildMutation,
    {
      buildId: ctx.announcedBuild.id,
      files: files.map(({ contentHash, contentLength, targetPath }) => ({
        contentHash,
        contentLength,
        filePath: targetPath,
      })),
      zip: ctx.options.zip,
    }
  );

  if (uploadBuild.userErrors.length) {
    uploadBuild.userErrors.forEach((e) => {
      if (e.__typename === 'MaxFileCountExceededError') {
        ctx.log.error(maxFileCountExceeded(e));
      } else if (e.__typename === 'MaxFileSizeExceededError') {
        ctx.log.error(maxFileSizeExceeded(e));
      } else {
        ctx.log.error(e.message);
      }
    });
    return options.onError?.(new Error('Upload rejected due to user error'));
  }

  const { sentinelUrls } = uploadBuild.info;

  const targets = uploadBuild.info.targets.map((target) => {
    const file = files.find((f) => f.targetPath === target.filePath);
    return { ...file, ...target };
  });

  if (!targets.length) {
    ctx.log.debug('No new files to upload, continuing');
    return options.onComplete?.(0, 0, sentinelUrls);
  }

  options.onStart?.();

  const total = targets.reduce((acc, { contentLength }) => acc + contentLength, 0);
  if (uploadBuild.info.zipTarget) {
    try {
      const { path, size } = await makeZipFile(ctx, targets);
      const compressionRate = (total - size) / total;
      ctx.log.debug(`Compression reduced upload size by ${Math.round(compressionRate * 100)}%`);

      const target = { ...uploadBuild.info.zipTarget, contentLength: size, localPath: path };
      await uploadZip(ctx, target, (progress) => options.onProgress?.(progress, size));
      return options.onComplete?.(size, targets.length, sentinelUrls);
    } catch (err) {
      ctx.log.debug({ err }, 'Error uploading zip, falling back to uploading individual files');
    }
  }

  try {
    await uploadFiles(ctx, targets, (progress) => options.onProgress?.(progress, total));
    return options.onComplete?.(total, targets.length, sentinelUrls);
  } catch (e) {
    return options.onError?.(e, files.some((f) => f.localPath === e.message) && e.message);
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
      return { ...file, ...target };
    });
    await uploadFiles(ctx, targets);
  }

  if (uploadMetadata.userErrors.length) {
    uploadMetadata.userErrors.forEach((e) => ctx.log.warn(e.message));
  }
}

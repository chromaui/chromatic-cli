import makeZipFile from './compress';
import { Context } from '../types';
import { uploadZip, waitForUnpack } from './uploadZip';
import { uploadFiles } from './uploadFiles';

const GetUploadUrlsMutation = `
  mutation GetUploadUrlsMutation($buildId: ObjID, $paths: [String!]!) {
    getUploadUrls(buildId: $buildId, paths: $paths) {
      domain
      urls {
        path
        url
        contentType
      }
    }
  }
`;
interface GetUploadUrlsMutationResult {
  getUploadUrls: {
    domain: string;
    urls: {
      path: string;
      url: string;
      contentType: string;
    }[];
  };
}

const GetZipUploadUrlMutation = `
  mutation GetZipUploadUrlMutation($buildId: ObjID) {
    getZipUploadUrl(buildId: $buildId) {
      domain
      url
      sentinelUrl
    }
  }
`;
interface GetZipUploadUrlMutationResult {
  getZipUploadUrl: {
    domain: string;
    url: string;
    sentinelUrl: string;
  };
}

export async function uploadAsIndividualFiles(
  ctx: Context,
  files: {
    localPath: string;
    targetPath: string;
    contentLength?: number;
  }[],
  options: {
    onStart?: () => void;
    onProgress?: (progress: number, total: number) => void;
    onComplete?: (uploadedBytes: number, domain?: string) => void;
    onError?: (error: Error, path?: string) => void;
  } = {}
) {
  const { getUploadUrls } = await ctx.client.runQuery<GetUploadUrlsMutationResult>(
    GetUploadUrlsMutation,
    { buildId: ctx.announcedBuild.id, paths: files.map(({ targetPath }) => targetPath) }
  );
  const { domain, urls } = getUploadUrls;
  const targets = urls.map(({ path, url, contentType }) => {
    const { localPath, contentLength } = files.find((f) => f.targetPath === path);
    return { contentLength, contentType, localPath, targetUrl: url };
  });
  const total = targets.reduce((acc, { contentLength }) => acc + contentLength, 0);

  options.onStart?.();

  try {
    await uploadFiles(ctx, targets, (progress) => options.onProgress?.(progress, total));
  } catch (e) {
    return options.onError?.(e, files.some((f) => f.localPath === e.message) && e.message);
  }

  options.onComplete?.(total, domain);
}

export async function uploadAsZipFile(
  ctx: Context,
  files: { localPath: string }[],
  options: {
    onStart?: () => void;
    onProgress?: (progress: number, total: number) => void;
    onComplete?: (uploadedBytes: number, domain?: string) => void;
    onError?: (error: Error, path?: string) => void;
  } = {}
) {
  const zipped = await makeZipFile(ctx, { paths: files.map((f) => f.localPath) });
  const { path, size: total } = zipped;
  const { getZipUploadUrl } = await ctx.client.runQuery<GetZipUploadUrlMutationResult>(
    GetZipUploadUrlMutation,
    { buildId: ctx.announcedBuild.id }
  );
  const { domain, url, sentinelUrl } = getZipUploadUrl;

  options.onStart?.();

  try {
    await uploadZip(ctx, path, url, total, (progress) => options.onProgress?.(progress, total));
  } catch (e) {
    return options.onError?.(e, path);
  }

  await waitForUnpack(ctx, sentinelUrl);

  options.onComplete?.(total, domain);
}

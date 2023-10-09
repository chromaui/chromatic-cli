import { join } from 'path';

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
  fileInfo: {
    paths: string[];
    lengths: {
      knownAs: string;
      pathname: string;
      contentLength: number;
    }[];
    total: number;
  },
  options: {
    onStart?: () => void;
    onProgress?: (progress: number, total: number) => void;
    onComplete?: (uploadedBytes: number, domain?: string) => void;
    onError?: (error: Error, path?: string) => void;
  } = {}
) {
  const { lengths, paths, total } = fileInfo;
  const { getUploadUrls } = await ctx.client.runQuery<GetUploadUrlsMutationResult>(
    GetUploadUrlsMutation,
    { buildId: ctx.announcedBuild.id, paths }
  );
  const { domain, urls } = getUploadUrls;
  const files = urls.map(({ path, url, contentType }) => ({
    path: join(ctx.sourceDir, path),
    url,
    contentType,
    contentLength: lengths.find(({ knownAs }) => knownAs === path).contentLength,
  }));

  options.onStart?.();

  try {
    await uploadFiles(ctx, files, (progress) => options.onProgress?.(progress, total));
  } catch (e) {
    return options.onError?.(e, files.some(({ path }) => path === e.message) && e.message);
  }

  options.onComplete?.(total, domain);
}

export async function uploadAsZipFile(
  ctx: Context,
  fileInfo: { paths: string[] },
  options: {
    onStart?: () => void;
    onProgress?: (progress: number, total: number) => void;
    onComplete?: (uploadedBytes: number, domain?: string) => void;
    onError?: (error: Error, path?: string) => void;
  } = {}
) {
  const zipped = await makeZipFile(ctx, fileInfo);
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

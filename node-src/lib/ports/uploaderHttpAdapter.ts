import retry from 'async-retry';
import { filesize } from 'filesize';
import { FormData } from 'formdata-node';

import HTTPClient from '../../io/httpClient';
import { FileReaderBlob } from '../fileReaderBlob';
import { Logger } from '../log';
import {
  SentinelFile,
  Uploader,
  UploadFileOptions,
  UploadFileTarget,
  WaitForSentinelOptions,
} from './uploader';

// A sentinel file is created by a zip-unpack lambda within the Chromatic infrastructure once the
// uploaded zip is fully extracted. The contents of this file will consist of 'OK' if the process
// completed successfully and 'ERROR' if an error occurred.
const SENTINEL_SUCCESS_VALUE = 'OK';

interface HttpUploaderDeps {
  /**
   * Lazy accessor for the HTTP client. The client is constructed after the
   * Ports bag, so adapters must defer resolution until a method is invoked.
   */
  getHttp: () => HTTPClient;
  log: Logger;
}

/**
 * Construct an {@link Uploader} that streams files via multipart POST to
 * signed URLs and polls sentinel URLs over HTTP.
 *
 * @param deps Runtime dependencies.
 * @param deps.getHttp Lazy accessor for the HTTP client used for uploads and polling.
 * @param deps.log Logger for progress and retry debug output.
 *
 * @returns An Uploader that talks to the real upload/sentinel endpoints.
 */
export function createHttpUploader(deps: HttpUploaderDeps): Uploader {
  return {
    async uploadFile(target: UploadFileTarget, options: UploadFileOptions) {
      const { contentLength, filePath, formAction, formFields, localPath } = target;
      const { onProgress, signal, retries } = options;
      let fileProgress = 0;

      deps.log.debug(`Uploading ${filePath} (${filesize(contentLength)}) to ${formAction}`);

      await retry(
        async (bail) => {
          if (signal?.aborted) {
            return bail(signal.reason || new Error('Aborted'));
          }

          const blob = new FileReaderBlob(localPath, contentLength, (delta) => {
            fileProgress += delta;
            onProgress(delta);
          });

          const formData = new FormData();
          for (const [k, v] of Object.entries(formFields)) {
            formData.append(k, v);
          }
          formData.append('file', blob);

          try {
            const result = await deps
              .getHttp()
              // @ts-expect-error - TS is not correctly resolving FormData in the types, but it is supported.
              .fetch(formAction, { body: formData, method: 'POST', signal }, { retries: 0 });
            if (!result.ok) {
              deps.log.debug(`Uploading ${localPath} failed: %O`, result);
              throw new Error(localPath);
            }
            deps.log.debug(`Uploaded ${filePath} (${filesize(contentLength)})`);
          } catch {
            throw new Error(localPath);
          }
        },
        {
          retries,
          onRetry: (err: Error) => {
            onProgress(-fileProgress);
            fileProgress = 0;
            deps.log.debug('Retrying upload for %s, %O', localPath, err);
          },
        }
      );
    },

    async waitForSentinel(sentinel: SentinelFile, options: WaitForSentinelOptions = {}) {
      const { name, url } = sentinel;
      const { signal } = options;

      deps.log.debug(`Waiting for '${name}' sentinel file to appear at ${url}`);

      await retry(
        // eslint-disable-next-line complexity
        async (bail) => {
          if (signal?.aborted) {
            return bail(signal.reason || new Error('Aborted'));
          }

          try {
            const response = await deps
              .getHttp()
              .fetch(url, { signal }, { retries: 0, noLogErrorBody: true });
            const result = await response.text();
            if (result !== SENTINEL_SUCCESS_VALUE) {
              deps.log.debug(`Sentinel file '${name}' not OK, got '${result}'.`);
              return bail(new Error(`Sentinel file '${name}' not OK.`));
            }
            deps.log.debug(`Sentinel file '${name}' OK.`);
          } catch (err) {
            const { message, response = {} } = err;
            if (response.status === 403) {
              return bail(new Error('Provided signature expired.'));
            }
            if (response.status === 404) {
              throw new Error(`Sentinel file '${name}' not present.`);
            }
            if (deps.log.getLevel() === 'debug') {
              deps.log.debug(await response.text?.());
            }
            return bail(new Error(message));
          }
        },
        {
          retries: 185,
          minTimeout: 1000,
          maxTimeout: 1000,
        }
      );
    },
  };
}

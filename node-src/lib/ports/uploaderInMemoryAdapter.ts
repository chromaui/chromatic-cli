import { SentinelFile, Uploader, UploadFileOptions, UploadFileTarget } from './uploader';

/**
 * Fixture-driven state backing the in-memory {@link Uploader} adapter. Callers
 * inspect `uploadedTargets` to assert on what was uploaded and populate
 * `sentinelReady`/`sentinelFailed` to control sentinel-poll outcomes.
 */
export interface InMemoryUploaderState {
  /** Targets that have been uploaded, in order. */
  uploadedTargets?: UploadFileTarget[];
  /** Sentinel URLs whose polling resolves successfully. */
  sentinelReady?: Set<string>;
  /** Sentinel URLs that should reject with the given error message. */
  sentinelFailed?: Record<string, string>;
}

/**
 * Construct an {@link Uploader} backed by an in-memory fixture. The state
 * object is held by reference so tests can mutate it between calls.
 *
 * @param state The mutable fixture driving the adapter's responses.
 *
 * @returns An Uploader that records uploads and reads sentinel outcomes from the fixture.
 */
export function createInMemoryUploader(state: InMemoryUploaderState): Uploader {
  return {
    async uploadFile(target: UploadFileTarget, options: UploadFileOptions) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new Error('Aborted');
      }
      state.uploadedTargets = [...(state.uploadedTargets ?? []), target];
      options.onProgress(target.contentLength);
    },
    async waitForSentinel(sentinel: SentinelFile, options) {
      if (options?.signal?.aborted) {
        throw options.signal.reason ?? new Error('Aborted');
      }
      const failure = state.sentinelFailed?.[sentinel.url];
      if (failure) {
        throw new Error(failure);
      }
      if (!state.sentinelReady?.has(sentinel.url)) {
        throw new Error(`Sentinel file '${sentinel.name}' not present.`);
      }
    },
  };
}

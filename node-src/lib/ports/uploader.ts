import type { TargetInfo } from '../../types';

/** Details needed to stream a single file to a signed-URL target. */
export interface UploadFileTarget extends TargetInfo {
  contentLength: number;
  localPath: string;
}

/** Runtime knobs for a single {@link Uploader.uploadFile} call. */
export interface UploadFileOptions {
  /** Incremental byte progress callback. Called with the delta since the previous call. */
  onProgress: (byteDelta: number) => void;
  /** Cancels the upload; an aborted signal fails the call with the signal's reason. */
  signal?: AbortSignal;
  /** Number of retry attempts before giving up. */
  retries: number;
}

/** Sentinel file descriptor used by {@link Uploader.waitForSentinel}. */
export interface SentinelFile {
  name: string;
  url: string;
}

/** Options for a single {@link Uploader.waitForSentinel} call. */
export interface WaitForSentinelOptions {
  signal?: AbortSignal;
}

/**
 * Semantic boundary over file streaming. Production callers use the HTTP
 * adapter; tests use the in-memory fake.
 */
export interface Uploader {
  /**
   * Stream a single file to its signed-URL target with retry and progress
   * reporting. Resolves on success; rejects with an error whose `message` is
   * the local path when the upload cannot be recovered.
   */
  uploadFile(target: UploadFileTarget, options: UploadFileOptions): Promise<void>;

  /**
   * Poll the sentinel URL until its body equals `'OK'`, the caller aborts, or
   * a bail condition is hit (sentinel missing, expired signature, sentinel
   * body is not `'OK'`). Rejects on any of those conditions.
   */
  waitForSentinel(sentinel: SentinelFile, options?: WaitForSentinelOptions): Promise<void>;
}

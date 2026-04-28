/** Tag value compatible with Sentry's `setTag`. */
export type ErrorReporterTagValue = string | number | boolean | undefined;

/**
 * Boundary over the error-monitoring SDK (Sentry in production). Production
 * callers send exceptions, contextual tags, and structured contexts; tests use
 * the in-memory fake to assert *what* was reported without spinning up a real
 * client.
 */
export interface ErrorReporter {
  /** Capture an exception, optionally tagged with structured key/value pairs. */
  captureException(error: unknown, tags?: Record<string, ErrorReporterTagValue>): void;
  /** Tag subsequent reports with `key=value` until reset by the SDK. */
  setTag(key: string, value: ErrorReporterTagValue): void;
  /** Attach (or remove, with `null`) a structured context block. */
  setContext(name: string, context: Record<string, unknown> | null): void;
  /** Wait for in-flight reports to upload. Returns whether the flush succeeded in time. */
  flush(timeoutMs?: number): Promise<boolean>;
}

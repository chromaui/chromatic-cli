const MAX_STACK_TRACE_LENGTH = 8000;

function preservePathTail(match: string): string {
  const lineCol = match.match(/:\d+(?::\d+)?$/)?.[0] ?? '';
  const pathPart = lineCol ? match.slice(0, -lineCol.length) : match;
  const filename = pathPart.match(/[^/\\]+$/)?.[0] ?? '';
  return filename ? `<path>/${filename}${lineCol}` : `<path>${lineCol}`;
}

/**
 * Remove PII and secrets from a stack trace.
 *
 * @param stackTrace Raw stack trace from an Error.
 *
 * @returns Sanitized stack trace, or empty string if none provided.
 */
export function sanitizeStackTrace(stackTrace: string | undefined): string {
  if (!stackTrace) return '';
  return (
    stackTrace
      .slice(0, MAX_STACK_TRACE_LENGTH)
      // Content wrapped in double quotes or backticks (common carrier of secrets).
      // Single quotes deliberately excluded to avoid eating apostrophes.
      .replaceAll(/(["`]).*?\1/g, '<redacted>')
      // Email addresses (local-part@domain.tld).
      .replaceAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '<email>')
      // File paths:
      //   ~/... or ~user/... — home-relative paths
      //   /...               — unix absolute paths (also matches URL authority `//host`)
      //   C:\...             — windows paths
      // `[^\s)]` stops at whitespace (incl. newlines) and closing paren from stack frames.
      .replaceAll(/~\w*\/[^\s)]+|\/[^\s)]+|[A-Za-z]:\\[^\s)]+/g, preservePathTail)
  );
}

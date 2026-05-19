import picocolors from 'picocolors';

/**
 * Canonical color palette for CLI output. Use these everywhere instead of inline `chalk.red(...)`
 * etc. so the palette can be adjusted in one place.
 */
export const CLI_COLORS = {
  success: picocolors.green,
  error: picocolors.red,
  warning: picocolors.yellow,
  info: picocolors.cyan,
  debug: picocolors.gray,
  // Only color a link if it is the primary call-to-action; ordinary links shouldn't be colored.
  cta: picocolors.cyan,
  muted: picocolors.dim,
};

const REDACTED = '<redacted>';
// Field-name shaped sensitive keys only: any *token-suffixed key and Authorization. Data
// keys must not match — package.json dependency names like js-tokens or script names like
// build:tokens hold ordinary values, and treating them as secret keys would scrub their
// values out of every string in the output.
const SENSITIVE_KEY_PATTERN = /^([a-z_]*token|authorization)$/i;
// Anchored on the header name (or the start of a raw Bearer value) so harmless mentions of
// "bearer" stay untouched; the scheme stays readable while the credential after it is
// replaced. "Basic" is an ordinary word at the start of a string, so it only matches behind
// the header anchor; a bare Bearer value at string start still has its credential redacted.
const AUTHORIZATION_CREDENTIAL_PATTERN =
  /(authorization\s*:\s*(?:basic|bearer)\s+|^\s*bearer\s+)[^\s"',;]+/gi;

/**
 * Replace the credential of an embedded or bare Authorization/Bearer/Basic value, then scrub
 * every collected secret from the string.
 *
 * @param value The string to scrub.
 * @param secrets The collected secret values to replace.
 *
 * @returns The scrubbed string.
 */
const scrubString = (value: string, secrets: string[]): string => {
  let result: string = value.replaceAll(AUTHORIZATION_CREDENTIAL_PATTERN, `$1${REDACTED}`);
  for (const secret of secrets) {
    result = result.replaceAll(secret, REDACTED);
  }
  return result;
};

/**
 * Collect the strings this walk treats as secret: every string inside a subtree under a
 * sensitive key, arrays included (repeated --project-token flags land in flags.projectToken
 * as an array). Strings outside those subtrees are not secrets.
 *
 * @param node The node to walk.
 * @param sensitive Whether an ancestor key already matched the sensitive-name pattern.
 *
 * @returns The collected secret strings.
 */
const collectStrings = (node: unknown, sensitive: boolean): string[] => {
  // An empty string is not a secret — and replaceAll('') would wedge the placeholder between
  // every character of the output — so empty values under sensitive keys are skipped.
  if (typeof node === 'string') return sensitive && node.length > 0 ? [node] : [];
  if (Array.isArray(node)) return node.flatMap((item) => collectStrings(item, sensitive));
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, item]) =>
    collectStrings(item, sensitive || SENSITIVE_KEY_PATTERN.test(key))
  );
};

/**
 * Remove values under sensitive keys at any depth — field-name shaped keys: any
 * token-suffixed key and Authorization — and scrub the values collected from those same
 * keys out of every remaining string, so a credential survives in no string form: not under
 * its key, not repeated in plain string collections like options.originalArgv, and not
 * inside embedded Authorization headers. `secretSources` contribute their sensitive values
 * to the collection without being walked into the output (e.g. ctx.env, whose key the
 * caller drops). Secrets are deduplicated and replaced longest-first, so a shorter value
 * that is a prefix of a longer one cannot leave the longer secret's suffix exposed.
 *
 * @param value The value to walk.
 * @param secretSources Extra values to collect secrets from, excluded from the output.
 *
 * @returns The value with sensitive keys removed and secrets scrubbed.
 */
export const redact = <T>(value: T, ...secretSources: unknown[]): T => {
  const secrets = [
    ...new Set([value, ...secretSources].flatMap((node) => collectStrings(node, false))),
  ].sort((a, b) => b.length - a.length);
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return scrubString(node, secrets);
    if (node === null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((item) => walk(item));
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? undefined : walk(item),
      ])
    );
  };
  return walk(value) as T;
};

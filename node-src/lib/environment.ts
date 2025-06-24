/**
 * Return a redacted form of visible environment variables.
 *
 * @param environment A map of environment variable names to their values.
 *
 * @returns The redacted map.
 */
export function redactEnvironment(environment: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(environment).map(([name, value]) => {
      return [name, redacted(value)];
    })
  );
}

function redacted(value: string | undefined): string {
  if (value) {
    if (value.length > 10) {
      return `${value.slice(0, 2)}...${value.slice(-2)}`;
    }
    if (value.length > 3) {
      return `${value[0]}...`;
    }
  }
  return '...';
}

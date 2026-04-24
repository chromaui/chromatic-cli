/**
 * The collection of external-dependency boundaries ("ports") used by the
 * Chromatic CLI domain code. Each field is filled in by a dedicated
 * port-extraction PR as part of an ongoing refactoring project to eliminate
 * the context god object.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Ports {}

/**
 * Construct the production `Ports` bundle with real adapters wired up.
 *
 * @returns A `Ports` record wired with production adapters.
 */
export function createDefaultPorts(): Ports {
  return {};
}

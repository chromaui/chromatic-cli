import { traceChangedFiles } from '../turbosnap';
import { DependencyTracer } from './dependencyTracer';

/**
 * Construct the production {@link DependencyTracer} backed by the existing
 * `lib/turbosnap` module. The adapter is a thin passthrough: turbosnap already
 * accepts `Context` and emits the affected-modules map.
 *
 * @returns A DependencyTracer that delegates to the turbosnap module.
 */
export function createTurbosnapDependencyTracer(): DependencyTracer {
  return { traceChangedFiles };
}

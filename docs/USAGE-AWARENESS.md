# Usage warnings for people and agents

The CLI requests account usage when announcing a build, before building or uploading Storybook. It refreshes that information after preparation and at completion. This includes runs using `--exit-once-uploaded`, which receive initialization and preparation warnings but do not wait for completion.

When the server returns a usage warning, the CLI prints the percentage of the included snapshot allowance consumed, billing-period end, days remaining, the warning code and recommended action, and whether further usage can incur overages. The server decides which threshold and consumption-pace warnings apply. Warnings alone do not change the build's exit code or pause the build. Existing quota and payment failures retain their exit codes.

The CLI also explains when TurboSnap is available but disabled, or when the server reports that it could not apply TurboSnap. Review the recommended configuration changes before starting further builds. Preserve test coverage: do not exclude dependencies or stories simply to reduce usage.

## Structured results

Agents can run `yarn chromatic --diagnostics-file=chromatic-diagnostics.json` (or pass that flag to their existing Chromatic command). The diagnostics include `announcedBuild.usageStatus` for the early summary and, after verification, `build.usageStatus` and `build.optimization` for the latest returned summary and guidance. Diagnostics redact project and report tokens but contain account usage, so share them only with appropriate recipients.

The Node API `run()` result exposes `usageStatus` and `optimization`. The GitHub Action exposes outputs of the same names, serialized as JSON when data is present. Those outputs may be the literal string `undefined` on an unsupported server; check for it before calling `fromJSON`.

`usageStatus` contains:

- `dataStatus` (`AVAILABLE` or `UNAVAILABLE`) and `recordedAt`.
- `periodStart`, `periodEnd`, `daysRemaining`, and `elapsedPercentage`.
- `billableSnapshots`, `includedSnapshots`, `remainingSnapshots`, and `usagePercentage`.
- `threshold`, `isOverageAllowed`, and optional `projectedSnapshots` estimates.
- `warnings`, each with `code`, `severity`, `message`, and `action`.
- `links.billing` and `links.documentation`.

`optimization` contains `turboSnapStatus`, `reason`, `recommendation`, and `documentationUrl`. Statuses are `UNAVAILABLE`, `NOT_ENABLED`, `APPLIED`, `BAILED`, and `UNKNOWN`.

Treat `null` usage, `UNAVAILABLE`, missing fields, and stale timestamps as unknown, never as zero usage or permission to consume more. An account summary can include usage from other projects. Projected usage is an estimate; concurrent builds can consume allowance after the summary was calculated.

Older servers that reject the new fields during GraphQL validation use the previous query. Authentication, budget refusal, network, and execution failures do not trigger that compatibility retry. Agents should never interpret a retry as authorization to increase a budget or allow overages. This change adds visibility; it does not introduce a new budget-enforcement policy.

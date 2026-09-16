# Server plan: exact required baselines and verified bypass builds

Draft for review and handoff, 16 September 2026. Implement in `chromaui/chromatic`; this task changes only CLI groundwork. All new protocol names and fields below are proposals for agreement with the server agent, not deployed APIs.

Research baseline: services commit `ad751b9bbe4973df20c0461e0e6b9d71c9db2fd5`, CLI base `eaa5afadc35c3978aef5cf2f0d0c99cfcde060b6` (package version 18.9.0). Recheck both repositories before implementation. The services checkout was clean during research. The CLI already had unrelated `.yarnrc.yml`, `yarn.lock`, and `.yarn/` changes; preserve them.

## Outcome and scope

A feature build must depend on an exact main commit X supplied by CI. If X has no usable build, persist a terminal failed feature attempt with no comparisons. Once X becomes usable, retrying the identical feature commit must resolve ancestry again. A newer main commit Y cannot replace X.

Each main invocation must register its own commit. When supported input hashes equal one usable effective source, the server may finalize an inherited build without capture. The inherited record keeps its own commit, ID, number, branch, source relationship, and proof. It must become eligible only after finalization succeeds.

Use this fixture throughout:

```text
main:       A --- X --- Y
                  \
feature:           P --- Q
```

A is the older usable build. P and Q require X. Preserve accepted feature review history and pending per-test behavior; do not reset every test's baseline to main. Do not add waiting, polling, historical reconstruction, merge auto-accept, provider-specific branch-point discovery, or an admin UI.

The current CLI branch parses both options, validates Git and option constraints, and stops before parent discovery with `BASELINE_FEATURE_UNSUPPORTED`. It deliberately sends no proposed GraphQL operations. [CLI groundwork](BASELINE-WORKFLOW.md) describes its exact behavior.

## Verified code findings

Paths in this section are relative to the services repository unless prefixed with `chromatic-cli/`.

| Existing code | Consequence for this work |
| --- | --- |
| `services/index/model/lib/ancestors.ts`: `getParentBuildIds` | Selects the first build per commit after same-branch/created-at sorting. A new running or failed attempt can mask an older usable one. Required-commit selection needs a separate eligibility rule. |
| `services/index/model/App.ts`: `hasBuildsWithCommits` | Reports presence through `ancestorBuildFilter`. Presence is not readiness; blocked attempts must not stop future parent discovery. |
| `services/index/model/lib/ancestors.ts`: `getAncestorBuilds` | Rejects SKIPPED builds as per-test ancestors and traverses parents. Keep commit identity separate from the effective source that owns captured tests. |
| `services/index/workflows/builds/announce.ts`: `newBuildDocument` | Independently calculates parents/ancestors and inserts ANNOUNCED. This is the authoritative place to enforce the preflight resolution and persist failures. |
| `services/index/api-webapp/build/mutations/announceBuild.ts` | Already validates project ownership of rebuild IDs through normal project authentication. Reuse these authorization boundaries. |
| `services/index/workflows/builds/uploadHashes.ts` | Stores the manifest hash, calculates changed stories, and conditionally applies HASH_BASED TurboSnap. Zero changed stories alone is insufficient: the comparison iterates current story keys, so removals also need explicit full-input equality checks. |
| `services/index/workflows/builds/upload.ts` | TurboSkip allows one ancestor with PASSED/ACCEPTED status **or the same branch**, and accepts effective Git-based empty story lists. Verified mode must require server hash proof and a usable source. |
| `services/index/workflows/builds/prepare.ts`: `prepareSkippedBuild` | Inherits artifacts and counts without inserting fresh tests. A missing source currently logs and finalizes zero tests. Verified mode must reject that path and resolve inherited source chains. |
| `services/index/api-webapp/build/mutations/prepareBuild.ts` | Returns a Boolean and can return true when the state no longer permits preparation. That Boolean is not a readiness acknowledgement. Authentication also checks the account's `useTurboSkip` directly, while upload uses `App.isFeatureFlagEnabled`; align verified-mode capability checks. |
| `services/index/model/App.ts`: `findPreferredDefaultBranch` | Can infer a branch from existing branch records. Strict pilot policy must explicitly identify main for an unlinked project; do not silently choose a recently active feature branch. |
| `chromatic-cli/node-src/lib/turbosnap/index.ts`, `v2/index.ts`, `v2/uploadHashes.ts` | Hash collection exists, but v2 runs for side effects and returns fallback. The future CLI must retain a typed authoritative proof outcome and inspect payload errors. |
| `chromatic-cli/node-src/lib/upload.ts`, `tasks/upload.ts` | Legacy skip preparation can log a failure and continue, and the upload task retries failures without file hashes. A verified-finalization failure must escape that fallback and remain nonzero. |

Read the services root `AGENTS.md`, `services/index/workflows/builds/AGENTS.md`, `services/index/model/lib/AGENTS.md`, and `docs/testing/index-testing.md` before edits. Preserve the conditional-update and commit-status timing conventions they describe.

## Decisions to ratify before wiring the CLI

Recommended pilot choices:

1. **Main branch policy:** require a configured main branch for the project. Use the existing configured app/repository value where authoritative; require explicit configuration for unlinked pilot projects. Missing policy is unsupported, not missing X.
2. **Multiple attempts at X:** select the newest eligible completed attempt on the configured main branch, ordered by build number with a deterministic ID tie-break. Newer announcements, failures, or pending-review attempts do not hide an eligible completed one. Confirm this product rule explicitly.
3. **Usability:** require a completed PASSED/ACCEPTED capture build, usable captures/artifacts under current baseline rules, no baseline exclusion, and supported CI scope. Reject local/dirty/publish-only/upgrade records unless current rules explicitly qualify them. A verified finalized bypass is eligible through its validated source chain. Legacy SKIPPED records never gain this status automatically.
4. **Stale feature ancestry:** preserve candidates demonstrably connected through the selected X; exclude unsafe candidates that would mask X. Keep X's identity in dependency metadata even when its effective test source is A. Do not infer a valid connection merely because a feature build is newer or contains the same hash.
5. **Ambiguous source:** capture normally when more than one effective source remains. Do not force a bypass or discard legitimate feature history to manufacture a single source.
6. **Reuse:** initially announce a new opted-in attempt every time, including repeated main commits. This meets the record requirement and avoids a second reuse protocol. Reuse may be added after proving compatible input and dependency identities.
7. **Combined options:** enforce the dependency first; only then consider bypass. `forceRebuild` suppresses bypass while retaining dependency enforcement.

The selector must preserve normal per-test policies for both `NEWEST_ACCEPTED` and `PREFER_MERGED`. A graph-only assertion that X appears in a parent list is not sufficient proof.

## Proposed authenticated protocol

Use the existing build GraphQL transport and project tokens. Do not use Public API M2M credentials. Agree names, GraphQL types, reason enums, and fixtures with the CLI agent before adding runtime operations.

### Capability negotiation

Add an opted-in capability query, proposed `app.baselineWorkflowCapabilities`, returning protocol version, required-baseline support, verified-bypass support, and a disabled/unsupported reason. Enforce the same gates again in every mutation. Reuse the existing account/project feature system with explicit internal-pilot enablement; do not assume `useTurboSkip` alone enables this workflow.

Preserve all legacy query strings and input shapes for non-opted-in callers. Unknown fields, malformed capabilities, missing required capabilities, authentication failures, and transport errors must fail the strict invocation. The existing best-effort `CLIAppInfo` query is unsuitable for this check.

Add version support in `services/index/utils/cliFeatureSupport.ts` once the integrated CLI release is chosen. The groundwork package version is not a supported release version.

### Exact dependency resolution

Proposed operation: `app.resolveBaselineDependency(input)`. Inputs: current commit, normalized branch, candidate parent commits, required commit, and supported build context. The project comes from authentication. Validate bounds and full commit-ID syntax on the server as well.

Return a discriminated result with:

| Field | Meaning |
| --- | --- |
| `state` | READY or BLOCKED. Unsupported capability is explicit, never READY with empty data. |
| `reason` | Stable reason enum; null only for READY. |
| `requestedCommit` | Exact required commit echoed for response validation. |
| `requiredBuild` | ID, number, commit, branch, status, and web URL when a relevant attempt exists. No asset URLs or tokens. |
| `canonicalParentCommits` / `canonicalParentBuildIds` | Parent relationships approved for this attempt. |
| `baselineBuilds` | Effective baseline records needed by changed-file calculation: ID, commit, committedAt, local/dirty metadata, and existing baseline fields. |
| `effectiveSourceBuildIds` | Captured content owners, distinct from a bypass commit's own build ID. |
| `resolutionId` | Opaque identity bound to project, P, X, scope, selected build IDs, source chains, and capture compatibility. Required for both READY and BLOCKED. |

Recommendation: use a short-lived server-owned resolution record or integrity-protected opaque token. If using a token, recompute and revalidate all referenced data on announcement; the token is not permission to use a stale baseline. Do not expose credentials in it. Bind meaningful eligibility/proof revisions, not every analytics `updatedAt`, to avoid false ancestry-change failures.

Required contract fixtures (publish JSON fixtures and generated schema together):

| Fixture | Required semantics |
| --- | --- |
| READY_CAPTURED | X selected; canonical ancestry includes the valid X connection; effective source is X. |
| READY_BYPASSED | X's own record selected; finalized proof/source chain resolves to captured A. |
| MISSING | BLOCKED / `BASELINE_BUILD_MISSING`; no usable fallback to A or Y. |
| IN_PROGRESS | BLOCKED / `BASELINE_BUILD_IN_PROGRESS`; include the relevant running X build link. |
| UNUSABLE | BLOCKED / `BASELINE_BUILD_UNUSABLE`; include failed, canceled, pending-review, or unfinalized source details and recovery action. |
| UNSUPPORTED | Explicit `BASELINE_FEATURE_UNSUPPORTED`; no silent legacy fallback. |
| CHANGED_RESOLUTION | Announcement returns `BASELINE_ANCESTRY_CHANGED` and a terminal failed attempt. |
| FINALIZED / FINALIZATION_FAILED | Explicit readiness true only after verified inheritance is committed; false/error retains failure details. |

Canonical resolution must not trust the CLI's candidate set as complete. In particular, prior P attempts cannot mask X. The future CLI should skip its current-commit stopping point in strict mode; server discovery must exclude dependency-blocked records. Reconcile feature candidates using existing ancestry helpers and baseline policy. If the server cannot safely preserve a stale candidate, exclude it and explain the decision in diagnostics rather than silently blessing it.

### Announcement and visible terminal failure

Recommended compatibility approach: extend `AnnounceBuildInput` with an optional versioned workflow input and add an optional result field to `AnnouncedBuild`. Use a separate opted-in CLI selection string. Existing callers omit both. `AnnouncedBuild.status` already uses `BuildStatus`, so a returned failed attempt can remain the existing build type. Confirm authorization allowlists for every added response field.

Carry required commit, resolution ID, bypass request, and force-capture intent. The response must include attempt ID/number/web URL, authoritative dependency state/reason, persisted ancestry, and resolution identity. Include a client attempt key for bounded transport retries if announcement is not already idempotent: retries of one request return the same record; a new CLI invocation creates a fresh attempt.

Within the announcement workflow:

1. Authenticate and validate all referenced IDs against the current project.
2. Re-resolve readiness and canonical ancestry. Recheck main policy, source existence, baseline exclusions, review status, capture compatibility, and feature availability.
3. Compare the resolution identity before inserting a runnable record. For a valid READY result, persist those exact parent/ancestor IDs; do not call the legacy resolver again and substitute different parents.
4. If BLOCKED is unchanged, persist a terminal FAILED record carrying the original reason. If BLOCKED became READY, or READY's selected ancestry became different/unusable, persist `BASELINE_ANCESTRY_CHANGED` (with current details) and require retry. Never proceed with stale changed-file calculations.
5. Publish the existing failure/check/webhook effects using established helpers. Set no capture/extract queue work and create no Test documents. Mark it excluded from baseline discovery explicitly.
6. Return failure metadata as data so the CLI can persist it before throwing exit 3. Do not return only a GraphQL error after inserting an otherwise invisible failure record.

Study `Build.updateById`, failure/status helpers, and `checkComplete.ts`; some helpers refuse to fail an already completed state. Avoid inserting a terminal record and then invoking a helper that assumes an incomplete build. Preserve `issuedAt` ordering after writes and before status reads. For unlinked projects, promise the CLI exit result; no provider check exists without an integration.

Revalidation and persistence need a documented concurrency strategy. Read source eligibility revisions and conditionally persist the resolution, or use the repository's appropriate transaction mechanism. Add a deterministic race test. A read followed by unrelated writes without revision checks is not a completed fix. Later prepare work must also verify that a persisted source has not vanished or become excluded.

### Verified bypass through existing hash/upload/prepare paths

Store an opted-in request on the announced build. Extend existing hash response fields conditionally with a proof outcome, reason, immediate source ID, effective captured source ID, and proof/compatibility identity.

Required proof:

- The server received supported manifest data for this announced build; payload validation errors or failed uploads are not proof.
- Full relevant input equality holds against exactly one effective usable source. Reuse manifest hashes and compare supported configuration/static inputs. Cover added **and removed** stories. An empty affected-story list, matching package metadata, or client-supplied `skipped: true` is insufficient.
- Capture stack, browsers, modes/viewports, relevant project features, and other capture-affecting configuration match. Check supported coverage; unsupported inputs fall back to capture.
- The source and every inherited hop belong to this project and remain usable. Same-branch PENDING/BROKEN sources cannot be promoted to green.
- Force capture, unavailable tracing, incompatible configuration, missing proof, and multiple effective sources produce a typed CAPTURE fallback with a reason.

In opted-in `uploadBuildWorkflow`, use persisted server proof exclusively. Never use Git-based zero-story fallback to authorize verified skipping, even if hash collection failed earlier. Legacy upload behavior remains unchanged for unopted builds. Normal capture can still use ordinary TurboSnap according to existing policy; it must not advertise verified whole-build inheritance.

In `prepareSkippedBuild`, resolve the effective source chain rather than assuming the immediate skipped source owns Test documents. Retain both immediate and effective source references; do not pretend inherited artifacts were captured at X. Use cycle detection, bounded traversal, project ownership checks, and missing-source protection. Distinguish a legitimately empty source under product rules from an accidental empty set caused by missing data; for the pilot, require a source with usable captured content.

Add an explicit finalization result/readiness field to the opted-in response. The legacy `prepareBuild` Boolean may stay unchanged for old clients; use a versioned wrapper around the same workflow or a same-request authoritative build result for strict clients. A stale-state early return, Boolean true, SKIPPED status, or inherited count is insufficient.

Finalization must atomically mark the proof FINALIZED only after required inheritance fields and artifacts are ready. Gate writes by expected status and proof state with `updateByIdWithCondition`; use a transition such as PROVED → FINALIZED rather than status SKIPPED alone. Separate durable readiness from retryable notification delivery. Repeated finalization should return the same result without duplicate billing or side effects. Missing source, invalid proof, a cancellation race, or failed preparation must leave readiness false and return `BYPASS_FINALIZATION_FAILED`.

The CLI must treat finalization failure as terminal, outside `uploadProject`'s generic deduplication retry. Optional display-stat queries may fail nonfatally only after authoritative readiness is true. No bypass success message may precede that acknowledgement.

## Data and query changes

Add optional versioned fields to `BuildDocument` and the model's runtime schema. Proposed groups:

- `baselineDependency`: requested commit, chosen main build, readiness/reason, canonical resolution identity, effective sources, and relevant revisions.
- `verifiedBypass`: requested, mechanism, proof state/reason, immediate/effective sources, input and compatibility identity, finalized timestamp, and failure reason.
- `baselineBlocked`: explicit exclusion marker or equivalent existing exclusion plus typed dependency reason. Keep it distinct from arbitrary legacy FAILED records.

Legacy absence means unverified. Do not infer proof or backfill readiness from SKIPPED alone. Extend schema/types, feature allowlists, and GraphQL authorization lists together. Review indexes for exact `{appId, commit, branch}` lookup and bounded source traversal; inspect query plans before adding an index.

Update `ancestorBuildFilter`, `App.hasBuildsWithCommits`, strict parent selection, and readiness lookup consistently. Skipped commit records can represent Git ancestry while their effective captured owners supply per-test baselines. Avoid globally changing `canBeAncestor` to admit arbitrary SKIPPED records.

Keep normal `baselines.ts`, `tests.ts`, and accepted-baseline ancestry semantics. If a selector change is necessary, update mirrored upgrade-baseline logic and tests identified by the scoped AGENTS.md. Pass existing local-build filters even though the pilot rejects local requests.

Security checks belong at each mutation: IDs and source chains must remain project-scoped; resolution tokens cannot be replayed for another project or commit; user-provided proof fields cannot declare readiness. Redact credentials, signed asset URLs, and CI environment data from fixtures and diagnostics. Limit candidate counts, token size, and traversal depth to prevent expensive unbounded work.

## Ordered implementation and review boundaries

| Boundary | Work and exit condition |
| --- | --- |
| 1. Contract and readiness | Agree decisions and schema; add shared enums, optional model fields, feature/capability gate, deterministic exact-commit eligibility, and chain resolver. Publish fixtures including multiple attempts, legacy skips, and cycles. No legacy behavior changes. |
| 2. Strict resolution and announcement | Add canonical resolution and identity; revalidate/persist failures at announcement; exclude blocked records from discovery; add ownership and race tests. Full captured-X dependency flow works through real resolvers/database. Depends on boundary 1. |
| 3. Verified bypass | Extend hash proof, tighten opted-in upload eligibility, finalize inheritance with explicit acknowledgement and idempotency. A → X → Y chains resolve without fresh tests on skips. Depends on boundary 1; integration with boundary 2 is required before release. |
| 4. CLI integration | Replace the groundwork guard with the agreed capabilities/resolution/announcement path; retain failure outputs; wire typed hash outcomes and finalization. Depends on the ratified schema, and runs against deployed staging support. |
| 5. Internal pilot | Exercise actual captures, failures, same-commit retry, both baseline algorithms, and bypass chains; record evidence; pin the supported CLI and deliberate project gate. Customer rollout follows only after review. |

Each boundary should be reviewable. Stack dependent PRs; independent hash and dependency implementation can target the shared contract branch after it exists. Do not create a dependency on a broad build-status redesign.

## Tests and release evidence

Use `setupDbContext` for model tests and `setupIntegrationTestMocks` with factories for workflows/resolvers. Do not mock internal baseline logic. Use `runQueryWithContext` and generated GraphQL helpers. Target existing `announce`, `upload`, `uploadHashes`, `prepare`, `ancestors`, and mutation suites; add a functional required-baseline scenario under `services/index/__tests__/`.

Minimum behavior matrix:

| Scenario | Assertion |
| --- | --- |
| A usable, X missing; P requires X | FAILED P exists, typed missing reason, no tests/dispatch; A and Y never substitute. |
| X ANNOUNCED/running | In-progress reason and X link; no polling. |
| X failed/canceled/pending/partly SKIPPED | Unusable reason; legacy status/count shortcuts cannot pass. |
| X has old eligible and newer ineligible attempts | Deterministic eligible selection, independent of insertion timing. |
| Same P retried after captured X becomes usable | Fresh resolution; blocked P excluded; new P uses the valid connection through X. |
| Historical PASSED P used A | Strict rerun resolves X; never reuses legacy success. |
| Valid feature review history vs stale feature ancestry | Retain valid accepted/pending behavior; stale candidates cannot mask X. Test NEWEST_ACCEPTED and PREFER_MERGED. |
| Preflight/announce races and replay | Ancestry change yields failed attempt; wrong-project/commit replay fails authorization; transport retry is idempotent. |
| Unchanged supported main inputs | X gets its own finalized source-linked record; no snapshots; descendants require X successfully. |
| Consecutive A → X → Y bypasses | Both exact commits resolve; captured source content and provenance retained. |
| Changed static/config input, removed story, missing hash proof, unsupported coverage, multiple sources | Typed fallback to capture, never a verified skip through Git fallback. |
| Same-branch unreviewed/failed source | Cannot finalize green verified inheritance. |
| Source deletion/exclusion, cycle, finalize/cancel race | Readiness remains false; no accidental zero-test success; retry has no duplicated effects. |
| Disabled gate/old schema/malformed response/transport failure | Strict CLI nonzero; legacy invocations still use unchanged operations. |
| Skip, prior no-op, exit-zero, exit-on-upload, force, dry-run | No dependency or finalization bypass; force disables optimization only. |

For the primary regression, use distinguishable captured content for an already merged change and a new feature change. Assert persisted parent and effective ancestor IDs **and actual baseline test/capture IDs or image hashes** after retry. Checking only request payloads or an X string in ancestry is insufficient.

From the services root, run scoped suites with `yarn test-backend <repository-relative-test-path>`, then both `yarn generate-graphql-schema` and `yarn typescript:generate` for schema/query changes. Run root `yarn typescript:check` and relevant lint. Follow current repo instructions if commands change.

From the CLI root, run relevant suites with `yarn test <paths>`, targeted `yarn lint:js <changed-files>`, `yarn typescript:check`, and `yarn build`. Groundwork tests do not establish backend eligibility or capture correctness.

Staging evidence must include: project/feature settings, server and CLI versions, fixture SHAs, failed and successful attempt links, required-build identity, canonical ancestry, actual test baselines/capture content, proof/finalization responses, CLI exits, and absence of capture dispatch for bypass. Use an internal unlinked-style project first, testing both a captured X and a bypassed X. Intentionally run P first, then X, then the identical P.

## Rollout and remaining CLI work

Deploy backend support with the pilot gate disabled. Enable the internal project, ship an integrated prerelease CLI, and complete staging evidence. Only then pin the supported CLI and enable the customer project. Keep main's existing acceptance policy. Missing or failed main builds require repair; an invocation alone is not readiness.

CI must run each relevant main commit, including intermediate commits in multi-commit pushes, and avoid canceling older required jobs. Bootstrap with a usable full main build. Feature CI supplies the actual branch-point SHA and sufficient history. Validate simple `git merge-base` usage against the customer's topology; do not substitute latest green builds or synthetic merge refs.

Remaining CLI integration is explicit: negotiate capability; discover strict candidates without current-commit short-circuiting; resolve canonical ancestry before changed-file calculation; carry BLOCKED results to announcement; retain attempt metadata before exit 3; surface typed v2 hash proof; require finalization acknowledgement; preserve transport/GraphQL exit codes; add server-backed acceptance tests. Preserve the existing groundwork checks and local diagnostics, replacing the unsupported guard only when these paths exist.

Track typed dependency failures, successful retries, proof/fallback reasons, and finalization failures through existing telemetry. Rollback deliberately disables the gate/options; a strict request must never silently downgrade. No staged-server exercise or customer enablement has been performed by this groundwork task.

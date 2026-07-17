# ADR 0020: Shared Client Core and Feature UI Boundaries

## Status

Proposed

## Date

2026-07-17

## Deciders

ApiaryLens project owner after WIN-007 review and the acceptance conditions below
are satisfied. This proposal does not authorize Windows or native-mobile
implementation.

## Context

ApiaryLens must preserve one product behavior across the web PWA, Windows standalone
and connected client, and later iOS/Android clients without pretending every platform
has the same storage, transport, lifecycle, accessibility, or UI conventions.

Reusing the entire PWA inside every host would leak browser/service-worker/cookie
assumptions into native products. Reimplementing each client would duplicate domain,
sync, conflict, migration, and authorization behavior. Selecting React Native,
Capacitor, or another mobile framework now would prematurely couple the Windows
decision to unapproved native-mobile work.

## Decision

Adopt a pure shared client core with explicit ports and share React UI at the feature
level where accessibility and platform behavior remain correct. Each client has an
independent composition root and release identity.

### Layer ownership

| Layer | Owns | Must not own |
|---|---|---|
| `packages/contracts` | Versioned API, sync, migration, export, configuration, errors, schemas, and test vectors | React, DOM, host, transport, storage, or provider code |
| `packages/domain` | Pure entities, value rules, calculations, permissions vocabulary, and deterministic policies | I/O, clocks/randomness without ports, UI, framework globals |
| Future `packages/client-core` | Use cases, commands, selectors, validation, conflict policy, deterministic sync/migration/update state machines, and ports | React, fetch, Dexie, SQLite, filesystem, keychain, Electron, service worker |
| `packages/api-client` | Typed API mapping over injected transport/session behavior | Direct global fetch, cookie assumptions, credential storage, host APIs |
| `packages/ui` | Accessible design tokens and low-level React components without product data access | Storage, transport, credentials, lifecycle, domain persistence |
| Future feature packages | Feature-level React workflows and view models over client-core ports | Browser-only globals, native secrets, direct database or arbitrary bridge access |
| `apps/web` | PWA composition, Dexie/outbox, service worker, browser transport/session/update adapters | Native filesystem/credential/process assumptions |
| Windows composition | Electron host/preload, standalone and connected adapters, Windows lifecycle, protected credentials, packaging | Duplicated domain/sync logic or renderer-native privilege |
| Later native-mobile composition | Platform UI/adapters, background/camera/notification/store behavior | A requirement to reuse React or the Windows host |

Packages are created only when at least two consumers or an independently testable
contract justify them. Existing code is extracted incrementally under characterization
tests; empty architecture-only packages do not count as progress.

### Required ports

Client core depends on capability-oriented interfaces, including:

- `LocalStore` for transactions, records, tombstones, cursors, outbox, and migration;
- `MediaStore` for originals/derivatives, hashes, quota, and durable pending state;
- `SyncTransport` for versioned push/pull/media requests and authenticated receipts;
- `SessionPort` for sanitized session state, refresh, revocation, and reauthentication;
- `Clock`, `IdGenerator`, and `Connectivity` for deterministic behavior;
- `LifecyclePort` for update/backup/restore/migration gating and pending-work safety;
- `NotificationPort` for in-app/platform update/follow-up notices without requiring
  push infrastructure; and
- `DiagnosticsPort` for redacted structured events without default telemetry.

Ports expose domain capabilities, not generic SQL, filesystem, HTTP, shell, registry,
or credential primitives. Errors are versioned domain outcomes with explicit
retry/conflict/recovery meaning.

### Composition behavior

The web PWA composes the client core with Dexie, browser media, service worker,
same-origin cookie transport, and browser lifecycle/update adapters. Windows composes
the same core with its local replica/outbox contract, main-process transport,
standalone service or connected backend, protected session adapter, and host
lifecycle. Later mobile clients implement the public ports and may use platform-
native UI while retaining shared contracts, domain policies, state machines, and
test vectors.

Standalone and connected modes do not fork feature code. The selected ports and
connection/migration state determine whether commands target the standalone service
or authenticated remote transport. Offline work always enters the same deterministic
local/outbox/conflict model.

### UI sharing rule

Share tokens, primitives, feature view models, and React workflows only when the
result passes each target's keyboard, screen-reader, high-contrast, zoom/text-size,
touch-target, reduced-motion, focus, modal, and platform-convention requirements.
Platform-specific views/adapters are correct when sharing would degrade the
experience. Visual similarity is not sufficient evidence for reuse.

Native privilege remains outside shared UI. React receives typed state/results and
invokes closed feature commands; it never receives reusable credentials, arbitrary
native bridges, or storage handles.

### Release and compatibility

Shared source packages do not become independently drifting user products. Each
client bundles an exact tested version and releases independently with metadata for:

- product/API/sync/local-store/migration/export contract ranges;
- required host bridge version and capability set;
- conformance/test-vector version;
- server compatibility and minimum safe update path; and
- rollback/restore compatibility.

A shared package update does not silently update an installed client. Client,
backend, and Scout releases retain independent versions and exact compatibility
declarations.

## Options considered

### Pure client core plus feature-level React sharing — proposed

Maximizes deterministic behavior and useful reuse while keeping I/O, security,
lifecycle, and platform conventions explicit.

### Reuse the complete PWA in every host

Fast initially, but couples native products to Dexie, service workers, browser
cookies, browser update semantics, and generic bridge pressure. Rejected as the
architecture, though the Windows renderer may reuse substantial feature UI through
the defined boundaries.

### Reimplement every client independently

Allows platform freedom but duplicates safety-critical sync, conflict, migration,
domain, and compatibility behavior and makes cross-client conformance expensive.
Rejected.

### Select React Native or Capacitor for all future clients now

Prematurely decides unapproved native-mobile technology and may weaken platform UI,
background, storage, accessibility, or store behavior. Deferred to later mobile
research/ADR.

### Publish every shared layer as a separately versioned public package

Adds release/compatibility overhead without an external consumer requirement.
Rejected initially; internal workspace packages are bundled into exact client
releases.

## Consequences

- Domain, sync, migration, and update behavior gains deterministic unit/conformance
  tests independent of React, browser, Electron, and storage providers.
- Existing web code must be characterized and extracted incrementally rather than
  copied wholesale into a Windows app.
- Adapter and composition code remains per platform and may be substantial; reuse is
  measured by behavior and maintainability, not line count.
- Cross-client fixtures and golden states become release inputs.
- UI packages need strict dependency rules to prevent storage/transport/native
  imports and accidental credential exposure.
- Native mobile remains feasible without making React Native or the Windows host a
  foregone conclusion.
- One hive and commercial datasets use the same pure/state-machine contracts; scale
  differences are expressed through pagination, bounded batches, partial sync, and
  adapter capabilities rather than a separate product architecture.

## Repository and gallery impact

Shared contracts/core/UI remain in the public product monorepo while they serve
product clients and release together inside client artifacts. A separate Windows
repository requires later evidence and an accepted ownership/cutover ADR; it would
consume versioned core artifacts/packages without copying source history. Scout
orchestrates releases but owns none of these client/domain packages.

No gallery or registry applies to core/domain/host adapters. Future user-installable
templates, equipment profiles, integrations, or plugins follow the separate
community gallery/registry design and cannot inject privileged native code into
these ports.

## Acceptance conditions

This ADR may move to Accepted only after:

1. Dependency rules and package APIs prove contracts/domain/client-core are pure and
   UI cannot import storage, transport, host, credential, or arbitrary native APIs.
2. Characterization tests preserve current PWA domain, offline, conflict, media,
   accessibility, and authorization behavior before extraction.
3. At least the web and Windows candidate compose the same commands/selectors/state
   machines through different real adapters and pass shared golden-state vectors.
4. Cross-client conformance covers create/edit/delete, pending work, conflict,
   media, auth expiry/revocation, migration, backup/update gating, clock/ID failures,
   interruption, and diagnostics redaction.
5. Web and Windows exact artifacts independently pass keyboard, screen-reader, high-
   contrast, 200%/400% zoom, reduced-motion, narrow/touch, focus, and modal tests;
   shared UI is split when target behavior differs.
6. Compatibility manifests bind exact package/test-vector/host-bridge versions and
   prove independent client/backend/Scout update and rollback behavior.
7. Build, license, SBOM, provenance, documentation, examples, and contributor rules
   identify public versus internal APIs and prevent accidental framework coupling.

## Revisit conditions

Reopen if shared packages become an externally supported SDK, extraction materially
degrades web performance/accessibility, a platform requires incompatible domain
semantics, native-mobile research selects a different UI strategy, or repository
ownership changes. Preserve public contracts and conformance vectors through any
split.

## References

- [Shared client UI and domain architecture research](../research/2026-07-16-shared-client-ui-and-domain-architecture-spike.md)
- [Offline synchronization protocol](../architecture/offline-sync-protocol.md)
- [Community galleries and registries](../architecture/community-galleries-and-registries.md)
- [ADR 0015: Windows-first client portfolio](0015-windows-first-client-portfolio.md)
- [ADR 0017: Windows native authentication and credential protection](0017-windows-native-authentication-and-credential-protection.md)
- [WIN-007](https://github.com/ApiaryLens/apiarylens/issues/10)

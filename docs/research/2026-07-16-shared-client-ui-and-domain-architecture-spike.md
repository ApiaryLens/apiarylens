# Shared client UI and domain architecture spike

- **Backlog:** WIN-007
- **Date:** 2026-07-16
- **Status:** Research complete; implementation is not authorized
- **Scope:** Web PWA, Windows standalone/connected, and future iOS/Android clients

## Decision sought

Determine which client behavior and presentation ApiaryLens can safely share without
turning the browser, Windows, iOS, or Android experience into a lowest-common-
denominator shell. The result must preserve accessibility, offline behavior, native
security boundaries, independent client releases, and platform conventions.

This spike evaluates boundaries and proposes extraction order. It does not populate
the empty shared-package or Windows-client directories.

## Requirements and constraints

### Functional

- The PWA and Windows client expose the same apiary, hive, inspection, care, media,
  family, backup, update, and synchronization behavior where their capabilities
  overlap.
- Windows supports both private standalone operation and connected offline-capable
  operation without changing feature components.
- Every client implements compatible record, conflict, media, migration, and export
  semantics.
- Platform hosts can supply navigation, update, file/camera, notification,
  credential, connectivity, and lifecycle behavior without leaking those concerns
  into domain logic.
- Future native mobile clients may use native presentation while remaining contract-
  and behavior-compatible.

### Non-functional

- WCAG 2.1 AA or better for shared web-rendered UI, plus host-specific keyboard,
  screen-reader, zoom, forced-colors, and touch evidence.
- No credential, session token, local-service control token, private key, or recovery
  code in shared persistent state, renderer storage, diagnostics, or connection
  profiles.
- Offline writes remain durable and idempotent across reconnect, update, crash, and
  migration.
- A client can update independently when its manifest declares compatible API, sync,
  database, migration, and feature-contract ranges.
- The family path remains understandable without Linux, cloud, database, or identity
  expertise.

### Existing decisions

- ADR 0015 keeps web, Windows, iOS, and Android in the product monorepo initially.
- ADRs 0008 through 0010 establish React/TypeScript PWA, versioned contracts,
  SQLite-family storage, offline outbox synchronization, and built-in identity.
- WIN-003 selects the Windows host/package later; the shared architecture must work
  with a web renderer in Electron, Tauri/WebView2, or another accepted host.
- WIN-004 and WIN-005 require a loopback/native security boundary and protected
  credential owner outside an untrusted renderer.
- Native iOS/Android implementation remains deferred. This spike must not silently
  select React Native, Capacitor, SwiftUI, Kotlin, or another mobile framework.

## Measured current state

The repeatable inventory is
[`scripts/research/win007-client-boundary-probe.mjs`](../../scripts/research/win007-client-boundary-probe.mjs).
The local baseline found:

| Surface | Measured state | Effect |
|---|---:|---|
| `packages/contracts` | Platform-neutral | Existing shared kernel to preserve |
| `apps/web/src/App.tsx` | 2,316 lines, 26 component functions | Domain UI and host composition are too concentrated |
| `App.tsx` browser references | Window, document, navigator, location, history, fetch, file/blob, service worker | Whole-file reuse would carry PWA lifecycle into Windows |
| `apps/web/src/db.ts` | 519 lines | Repository, outbox, sync, media bytes, thumbnail canvas, and transport are coupled |
| `apps/web/src/api.ts` | 77 lines, direct fetch | Assumes relative same-origin endpoints and browser cookie/CSRF behavior |
| `packages/api-client` | Empty placeholder | No reusable transport client exists yet |
| `packages/shared` | Empty placeholder | Must not become an unowned miscellaneous package |
| `packages/ui` | Empty placeholder | No extracted design system or feature UI exists yet |
| `apps/windows` | Empty source directory | No Windows product scaffold is claimed |

The existing shared-UI accessibility probe already exercises the production React
bundle at desktop, 200% and 400% reflow equivalents, forced colors, reduced motion,
keyboard focus, target size, and automated WCAG rules. That demonstrates a useful
web-rendered UI foundation, not native-host accessibility completion.

GitHub Actions run
[`29552499665`](https://github.com/ApiaryLens/apiarylens/actions/runs/29552499665)
reproduced the dependency and host-coupling inventory on the Windows hosted runner
and retained the sanitized `win007-client-boundary-evidence` artifact for 14 days.

## Recommended architecture

Select **feature-level React reuse over a shared application shell**. Share pure
behavior first, then accessible feature components whose dependencies are injected.
Keep composition roots, persistence, transport authentication, navigation, updates,
and native integrations in each host.

### Layer ownership

| Layer | Responsibility | Allowed dependencies | Forbidden dependencies |
|---|---|---|---|
| `packages/contracts` | Versioned schemas, API/sync/migration/export types, errors, test vectors | Zod and pure TypeScript | React, DOM, Node, storage, transport, host APIs |
| Future `packages/client-core` | Use cases, commands, selectors, conflict policy, deterministic sync state machines, ports | Contracts and pure TypeScript | React, fetch, Dexie, SQLite, filesystem, keychain, host globals |
| `packages/api-client` | Typed endpoint mapping over an injected transport and session strategy | Contracts and client-core ports | Cookie assumptions, credential storage, direct global fetch |
| Future `packages/client-features` | React feature components and view models for apiaries, hives, inspections, care, media, family, lifecycle | React, contracts, client-core, UI primitives | Direct repository, fetch, Dexie, service worker, native bridge, secrets |
| `packages/ui` | Accessible primitives, tokens, form patterns, status semantics, responsive layout | React and documented styling inputs | Domain persistence, network calls, host lifecycle |
| `apps/web` | PWA composition root and browser adapters | Shared layers, Dexie, service worker, browser transport | Native credential or filesystem assumptions |
| `apps/windows` | Windows composition root, host bridge, package lifecycle, standalone/connected adapters | Shared layers and accepted host framework | Renderer-owned secrets or unrestricted native APIs |
| Future `apps/ios` / `apps/android` | Platform composition and presentation | Contracts/test vectors; shared executable core only if later ADR selects a compatible runtime | Forced React UI or browser lifecycle assumptions |

Do not create both `packages/shared` and `packages/client-core` with overlapping
ownership. Retire the empty `shared` placeholder or reserve it only through an ADR
with a precise responsibility.

### Ports

The shared application layer should depend on explicit ports:

- `ResourceRepository` for queries, commands, tombstones, and transactions;
- `OutboxRepository` for pending operations, attempts, receipts, and conflicts;
- `MediaRepository` for original/thumbnail staging, local display, verification, and
  lifecycle state;
- `SessionPort` for non-secret session view, capability checks, refresh, and sign-out;
- `SyncTransport` for versioned push/pull/media requests and authenticated receipts;
- `ConnectivityPort` for reachable/unreachable transitions and foreground retry
  opportunities rather than raw `navigator.onLine`;
- `UpdatePort` for available, staged, blocked-by-pending-work, activated, failed, and
  rolled-back states;
- `NavigationPort` for routes, deep links, back behavior, and host-owned overlays;
- `FileSelectionPort` and `ImageTransformPort` for browser picker/canvas versus native
  picker/codec behavior;
- `Clock`, `IdGenerator`, and `Logger` ports for deterministic tests and redaction.

Ports describe capability and behavior, not operating-system types. Results use
versioned domain errors so feature UI can present consistent recovery choices.

### Composition flows

**PWA:** React feature → client-core use case → Dexie repository/outbox → browser
transport using secure same-origin cookies and CSRF → remote API. Service worker,
installation, browser update activation, and browser connectivity remain in the PWA
composition root.

**Windows standalone:** React feature → client-core use case → restricted native
bridge → loopback service → shared SQLite/filesystem backend. The host owns the local
control token and process supervision; the renderer receives neither unrestricted
filesystem access nor reusable service credentials.

**Windows connected:** React feature → client-core use case → Windows local replica
and outbox → native transport → remote HTTPS API. The host owns protected remote
session material and rotation. Offline reads/writes never depend on a live remote
session, and reconnect invokes the same deterministic sync state machine.

**Future native mobile:** platform view → contract-compatible use case/port
implementation → local platform database/outbox → native HTTPS/session adapter. A
later ADR may reuse TypeScript client-core through a compatible runtime, but JSON
schemas, OpenAPI, state-machine vectors, and conformance tests remain the normative
cross-language boundary.

## State and security boundaries

Shared feature state may contain domain data, non-secret identity display fields,
capabilities, pending counts, conflict previews, connectivity state, and update
eligibility. It must never contain passwords, recovery codes after their one-time
display, CSRF secrets beyond the browser session boundary, bearer/session tokens,
local-service control tokens, deployment credentials, or key material.

The renderer requests capabilities such as `sync`, `selectPhoto`, or `openBackup`
through a narrow bridge. It does not receive a generic shell, filesystem, process,
registry, credential-vault, or arbitrary HTTP primitive. Every native request is
schema-validated and authorization-tested.

## Accessibility and platform behavior

Reuse semantic feature markup, status language, form labeling, error association,
focus restoration, and design tokens. Do not force every host to reuse:

- bottom navigation versus Windows navigation/sidebar patterns;
- browser URL and history behavior;
- native title bar, menus, file dialogs, notifications, or window commands;
- browser update banners versus signed package lifecycle UI; or
- phone-specific camera, sheet, back-gesture, and safe-area presentation.

Shared component tests are necessary but insufficient. Each released host needs
screen-reader, keyboard/touch, 200%/400% zoom, forced-color/high-contrast, reduced-
motion, responsive, and physical-device evidence.

## Release and compatibility model

Shared packages are internal monorepo build inputs, not independently supported end-
user products. Each client bundles an immutable tested version and releases on its
own cadence. Release manifests record:

- product/client build identity;
- API, sync, database, migration, export, and feature-contract ranges;
- local-store adapter and migration head;
- required host bridge version and capabilities;
- shared test-vector/conformance version; and
- rollback/restore compatibility.

A newer shared package never reaches users by workspace resolution alone; it must
pass and ship inside a client artifact.

## Options evaluated

### Reuse the entire PWA inside every host

Maximizes initial reuse but carries service-worker, browser navigation, same-origin
auth, IndexedDB, and browser update assumptions into Windows and mobile. It also
encourages renderer-owned credentials and generic native bridges. Rejected.

### Reimplement every client independently

Fits platform conventions but duplicates conflict, offline, migration, domain,
validation, and accessibility fixes. Contract drift would be likely before the
product has multiple client teams. Rejected.

### Select React Native or Capacitor for every client now

Could increase executable UI reuse but prematurely chooses mobile/store/runtime
constraints and does not remove the need for native security, storage, update, and
accessibility adapters. Deferred to later mobile research.

### Pure core plus feature-level React sharing

Preserves current React investment for PWA and Windows while keeping hosts and future
native mobile presentation independent. Selected for the follow-on ADR.

## Extraction and verification order

1. Freeze current behavior with user-journey, offline, conflict, media, and
   accessibility characterization tests.
2. Extract pure policies, selectors, commands, state machines, and ports into
   `client-core`; prove it imports no browser, Node, React, or storage runtime.
3. Refactor `api.ts` into an injected transport client with browser and native
   strategies; add negative secret-boundary tests.
4. Split `db.ts` into Dexie repository/outbox/media adapters plus pure sync
   orchestration. Preserve database migrations and interrupted-upgrade repair.
5. Split `App.tsx` by feature, then inject use cases/view models. Do not move direct
   host globals into shared components.
6. Establish PWA composition with unchanged released behavior and regression
   evidence.
7. After host ADR and implementation authorization, compose the same feature/core
   layers with restricted Windows adapters.
8. Run cross-client contract, golden-state, conflict, media, migration,
   accessibility, security, and release-compatibility suites.

Each extraction is independently reviewable and reversible. Directory creation or a
successful build is not completion.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `client-core` becomes a second backend/domain model | Keep server authorization authoritative; share schemas and deterministic client behavior only |
| Generic `shared` package becomes a dependency junk drawer | One named owner and explicit allowed dependency rule per package |
| Windows renderer gains secrets/native privilege | Narrow schema-validated bridge; host-owned credentials and transport |
| PWA regressions during extraction | Characterization tests and behavior-preserving slices before Windows composition |
| Shared UI blocks platform conventions | Share feature semantics/components selectively; keep shell/navigation/lifecycle host-specific |
| Cross-language mobile drift | Generated schemas plus normative state-machine vectors and conformance suites |
| Shared package update couples releases | Bundle tested versions into independently released client artifacts |

## Follow-on decisions and evidence

- Accept an ADR defining the package/port boundaries, dependency rules, composition
  roots, native bridge, and mobile conformance boundary.
- Update the detailed Windows design and authoritative Lucidchart client-component,
  data-flow, and trust-boundary diagrams.
- Decide the Windows host in WIN-003 before introducing host-framework dependencies.
- Define native session transport in WIN-005 and migration protocol in WIN-006's
  follow-on ADR/design.
- Prove PWA behavior parity before and after extraction.
- Prove the exact Windows artifact with NVDA, keyboard, zoom, High Contrast, offline
  launch, process recovery, credential isolation, and signed update lifecycle.
- Revisit repository extraction only when ownership, release cadence, or toolchain
  evidence invalidates ADR 0015.

## WIN-007 acceptance mapping

WIN-007 asks for evaluation and a safe-reuse recommendation. The research gate is
satisfied as follows:

| Required concern | Research result |
|---|---|
| Web and Windows reuse | Pure client core, injected ports, accessible feature-level React, and separate composition roots |
| iOS and Android reuse | Normative schemas/state-machine vectors and optional executable-core reuse; no forced UI/runtime decision |
| Accessibility | Shared semantic component rules plus mandatory host/device-specific screen-reader, input, zoom, contrast, motion, and touch UAT |
| Platform conventions | Shell, navigation, deep links, dialogs, updates, notifications, camera, and back behavior stay host-specific |
| Storage/offline behavior | Repository, outbox, media, connectivity, and sync ports separate pure behavior from Dexie, SQLite, filesystem, and native adapters |
| Security | Host-owned credentials and transport; narrow schema-validated bridge; no renderer secrets or generic native primitive |
| Release isolation | Shared code is bundled into independently released clients with explicit compatibility metadata |
| Current feasibility | Automated Windows inventory proves the contracts kernel is neutral and identifies each current browser coupling and empty placeholder |

This closes research only. Package extraction, PWA refactoring, Windows composition,
native-mobile selection, and released-host UAT remain gated follow-on work.

## Recommendation

The resulting decision is now captured as proposed
[ADR 0020](../adr/0020-shared-client-core-and-feature-ui-boundaries.md).

Proceed to an ADR selecting a **pure client core, injected ports, feature-level React
reuse, and host-specific composition roots/adapters**. Do not reuse the PWA as an
undifferentiated webview application, force one UI technology onto future native
mobile clients, or implement shared packages before the dependency rules and
characterization tests are accepted.

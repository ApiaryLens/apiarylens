# Windows-First ApiaryLens Client and Scout Bee Deployment Design

## Status and intent

**Status:** Production implementation authorized; Windows release gates remain open.

This is the detailed post-Preview design for making the packaged Windows client the
default family starting point while preserving the existing portable backend and web
frontend. It implements the product direction accepted in
[ADR 0015](../adr/0015-windows-first-client-portfolio.md) and the Scout repository
boundary accepted in [ADR 0014](../adr/0014-scout-bee-separate-repository-and-release.md).

Public Preview 1 remains the current testable web/PWA release. Preview 2 is expected
to contain major architectural and experience changes; no document may imply that
the Windows package, new Scout repository, or standalone-to-connected migration is
already complete.

The first production tranche now exists in [`apps/windows`](../../apps/windows/README.md).
It composes the real React UI and portable API in a single-instance Electron host,
supervises an IPv4-loopback-only local service, protects standalone secrets in the
main process, and exposes only a versioned preload bridge. This does not accept ADR
0016, produce a signed package, or satisfy the clean-profile and physical-device
release gates below.

## Product experience

The default family journey is:

1. Download the signed ApiaryLens for Windows package or begin in Scout Bee.
2. Choose **Use on this computer** or **Connect my family**.
3. Use the complete hive-management client immediately in standalone mode, without
   Linux, WSL, Docker, SSH, DNS, or a cloud account.
4. At any later time choose **Add family access**. Scout Bee explains options,
   deploys a compatible backend and optional web frontend, verifies it, and returns
   a secret-free connection profile.
5. ApiaryLens creates and verifies a local backup, authenticates the owner to the
   target, previews transfer/conflicts, connects the current Windows installation,
   and automatically synchronizes.

Advanced users can begin with a connected profile, export plans to CI/CD, or deploy
the backend without installing the Windows client.

## System composition

### Product clients

| Client | Default role | Offline store | Distribution |
|---|---|---|---|
| Windows | Default packaged personal/family client | Shared local-store contract plus embedded standalone service or connected replica/outbox | Signed Windows package; exact format follows research ADR |
| Web PWA | Browser and installable cross-platform client | Dexie/IndexedDB replica and outbox | Optional web frontend with connected backend; official hosted entry points |
| iOS/iPadOS | Later native family/field client | Native implementation of shared local-store/sync semantics | Apple App Store |
| Android | Later native family/field client | Native implementation of shared local-store/sync semantics | Google Play or documented signed package policy |

All clients consume the same public API, sync, media, export, connection-profile,
and compatibility contracts. They may use platform-appropriate storage and UI code,
but must pass shared behavioral conformance tests.

### Standalone Windows composition

- Packaged client shell hosting the shared React product experience where practical.
- Private supervised local service bound to a random loopback port only.
- Shared Node SQLite schema/migrations and filesystem media adapter.
- Per-installation authentication boundary appropriate to device-only use; enabling
  LAN, VPN, tunnel, or public exposure is prohibited.
- Local release identity, health, diagnostics, backup catalog, and restore support.
- No required cloud, Linux runtime, WSL, Docker, third-party identity, or telemetry.

The embedded service is not a hidden network server. The host generates a per-launch
control secret, restricts filesystem permissions, supervises process lifetime, and
refuses non-loopback binding.

### Connected composition

A connected deployment contains:

- a Cloudflare Worker/D1/R2 backend or portable Compose backend on Linux;
- optionally the web PWA frontend for browser and installed-PWA access;
- the same migration, media, identity, authorization, backup, and export contracts;
- one or more Windows, web, iOS, or Android clients; and
- automatic synchronization on save, resume, reconnect, and periodic foreground
  opportunity while a valid session exists.

The web frontend and backend may be deployed together for the simple family path or
separately for advanced operators. The API never assumes the web frontend exists.

## Repository ownership

```text
ApiaryLens/apiarylens
  apps/web
  apps/windows
  apps/ios
  apps/android
  apps/api
  apps/worker
  packages/contracts
  packages/database
  packages/media
  future shared UI/domain packages when measured reuse justifies them

ApiaryLens/scout-bee (https://github.com/ApiaryLens/scout-bee)
  React guide
  executor and platform adapters
  Windows/Linux packaging
  self-update
  compatibility resolver
  deployment/client lifecycle tests
```

The product monorepo publishes immutable client, backend, web, migration, and
evidence artifacts. Scout Bee downloads and applies them. It never copies product
source into a personal deployment repository.

## Scout Bee responsibilities

### Windows client lifecycle

- Discover stable by default; Preview/RC requires explicit advanced opt-in.
- Verify manifest identity, checksum, signature/attestation, size, publisher, and
  compatibility before installation.
- Install per-user by default, with machine-wide installation only after explicit
  elevation and design support.
- Create Start menu shortcuts, application identity, uninstall entry, protocol/file
  association only when approved, and no automatic startup without consent.
- Detect, stage, apply, verify, roll back, repair, diagnose, and uninstall the client.
- Preserve data during application updates and keep-data uninstall; clearly separate
  application removal from data deletion.

### Backend and optional web lifecycle

- Recommend Cloudflare, owned Linux hardware/VM, cloud Linux VM, or advanced export.
- From Windows, deploy Cloudflare through its supported API/tool boundary or deploy
  Compose to Linux over pinned SSH without requiring the user to type Linux commands.
- Create resources, secrets, HTTPS, migrations, health verification, backup policy,
  restore tests, and optional web frontend.
- Export the secret-free deployment plan, artifact lock, verification record, and
  CI/CD instructions for advanced users.

### Client connection handoff

Scout writes or transfers only the schema-validated connection profile:

- profile ID and display name;
- mode and client kind;
- HTTPS backend URL;
- server product/API/sync compatibility identity; and
- provisioning source and timestamps.

It never stores a user password, session, provider token, SSH private key, deployment
secret, or recovery code in that profile. Authentication happens through the client
after import.

### Later Scout mobile direction

A later Scout companion on iPhone or Android may select a target, invoke a remote
or provider API, monitor progress, and hand a connection profile to the product
client. It does not install an iPhone application outside the App Store, retain
high-privilege deployment credentials unnecessarily, or require a phone to stay
awake for unsafe long-running execution. This work requires a separate threat model,
research spike, ADR, and platform-store review.

## Standalone-to-connected transition

Connecting is a controlled migration, not a URL preference:

1. Verify both client and server compatibility.
2. Create and restore-test a standalone backup.
3. Inventory pending records and media; do not discard or double-submit them.
4. Authenticate the target owner through the accepted native-client flow.
5. Compare organization identity and existing target records.
6. Offer explicit create-new-family, merge/import, or cancel choices.
7. Preview conflicts and irreversible effects.
8. Transfer records/media idempotently with resumable progress.
9. Pull the authoritative synchronized state and verify counts and hashes.
10. Retain the pre-connect backup and rollback instructions.

Disconnecting a connected client does not automatically create an authoritative
standalone server. Export-to-standalone is a separately confirmed recovery/migration
flow with data-completeness checks.

## Updates and compatibility

ApiaryLens product, individual clients, backend deployments, and Scout Bee have
independent versions. Compatibility is resolved through contract ranges and release
manifests.

- Client update: preserve local data/outbox, notify the user, stage safely, activate
  only when pending work is protected, health-check, and roll back compatible code.
- Standalone service update: verify backup, stop writes, migrate, activate, verify,
  and restore on incompatible failure.
- Connected backend update: Scout verifies all known clients' compatibility where
  available, creates a server backup, updates, verifies, and reports clients needing
  upgrade.
- Scout self-update: separate signed channel and rollback; never coupled to product
  selection.
- Critical security update: prominent notice and supported deferral policy without
  silently overriding active field work.

## Backup, restore, and portability

### Standalone

- One-click local backup with selectable destination.
- Optional scheduled backups after consent.
- Database, original media, configuration references, release identity, checksums,
  and restore metadata in one portable archive.
- Clear warning when the only backup is on the same disk.
- Restore into a clean compatible Windows profile and byte/count verification.

### Connected

- Scout invokes profile-appropriate Cloudflare or Compose backup/restore.
- The client shows last verified server backup when the operator endpoint can safely
  provide that status.
- Local replica/outbox protection is not labeled as a server backup.
- User-owned export remains available independently from operator backup.

## Authentication and security

The detailed actors, trust boundaries, controls, measured evidence, and residual
release risks are maintained in the
[Windows client threat review](../security/windows-client-threat-model.md).

- Standalone binds only to loopback and stores data under a protected per-user data
  directory.
- Connected profiles require publicly trusted HTTPS.
- Native-client authentication needs an accepted Authorization Code with PKCE or
  equivalent public-client design; passwords/tokens are not stored in profile JSON.
- Secrets use platform credential protection only after a dedicated design review.
- All organization-scoped operations remain server-authorized.
- Diagnostics redact home paths, usernames, URLs when requested, hive data, media,
  credentials, tokens, and recovery material.
- Updates require signed/attested immutable artifacts and downgrade protection.

## Required research spikes before host implementation

1. **Windows host and packaging:** Electron, WebView2 plus bundled sidecar, Tauri,
   and Windows App SDK; measure installed size, cold start, memory, accessibility,
   offline storage, Node/SQLite reuse, supervision, signing, updater behavior,
   licensing, and clean-profile prerequisites.
2. **Embedded local service:** lifecycle, random loopback port/control token,
   crash recovery, file locking, multi-window behavior, migrations, firewall
   behavior, and safe per-user data paths.
3. **Native-client authentication:** PKCE, external user-agent return, Windows broker
   options, session refresh/revocation, offline expiry, and self-hosted HTTPS trust.
4. **Client data portability:** standalone-to-connected import/sync, large media,
   conflicts, interruption/resume, rollback, and cross-profile hash evidence.
5. **Windows packaging and updates:** MSIX, installer, portable package, signing,
   SmartScreen reputation, delta/full updates, rollback, repair, and uninstall data
   semantics.
6. **Shared UI architecture:** quantify what can be shared among web/Windows/iOS/
   Android without compromising platform accessibility or forcing one framework.
7. **Scout orchestration from Windows:** Cloudflare and SSH flows with no Linux CLI,
   prerequisite remediation, elevation boundaries, and remote failure recovery.
8. **Mobile Scout feasibility:** provider APIs, secure credential lifetime,
   background execution limits, store policies, and connection-profile handoff.

Every spike records dated primary sources, prototypes, measured evidence, licensing,
risks, rejected options, and the ADRs it informs.

## Required ADRs and design documents

- Windows host framework and package format.
- [Embedded standalone service and local data/security boundary](../adr/0018-windows-standalone-service-and-local-data-boundary.md).
- [Native-client authentication and credential storage](../adr/0017-windows-native-authentication-and-credential-protection.md).
- [Standalone-to-connected migration and conflict semantics](../adr/0019-standalone-to-connected-migration-and-authority-cutover.md).
- [Multi-client shared UI/domain boundary](../adr/0020-shared-client-core-and-feature-ui-boundaries.md).
- [Windows/product/Scout release-channel and update compatibility policy](../adr/0021-independent-product-client-and-scout-release-compatibility.md).
- Mobile Scout orchestration, only if pursued after the Windows path.

Focused designs must cover Windows UX/navigation, local directories, process
supervision, connection-profile import, automatic sync, update notification,
backup/restore, member management, installer UX, diagnostics, and accessibility.

## Required diagrams

Create authoritative Lucidchart sources in the ApiaryLens folder and commit
accessible exports for:

- client portfolio and repository ownership;
- standalone Windows runtime and trust boundaries;
- connected Windows/web/mobile deployment;
- Scout Windows-to-Cloudflare and Windows-to-Linux flows;
- standalone-to-connected data migration and rollback;
- independent Scout/client/backend update state machines; and
- backup/restore/data-location flows.

Each export needs adjacent explanatory text and must be cataloged in the diagram
README. Mermaid may be used only as temporary thinking material, never the source of
truth.

The authoritative seven-page source and accessible exports are cataloged in
[Windows Client and Scout Bee Architecture](../diagrams/windows-scout-architecture.md).

## Documentation and how-to deliverables

### Public user guides

- Five-minute Windows standalone setup.
- Add family access to an existing standalone installation.
- Connect Windows to an existing ApiaryLens family.
- Use ApiaryLens offline and understand automatic synchronization.
- Update notification, safe activation, and recovery.
- Local and connected backup/restore.
- Move from standalone to connected and back out safely.
- Manage family members, invitations, roles, and removal.
- Uninstall while keeping data; permanently remove data.

### Scout Bee guides

- Install/update Scout on Windows without Go, Node, WSL, or Linux commands.
- Deploy backend plus optional web frontend to Cloudflare.
- Deploy from Windows to owned or cloud Linux over SSH.
- Install/configure/update the Windows client.
- Export plans and use `my-apiarylens`/CI/CD.
- Repair, diagnose, roll back, restore, and uninstall.
- Explain every data location, log, cache, secret boundary, and privacy choice.

### Operator and developer guides

- Build/package/sign every Windows artifact from source.
- Implement a compatible client connection profile.
- Run cross-client API/sync conformance suites.
- Add a deployment adapter without embedding product source.
- Release compatibility matrix and emergency patch procedure.
- Architecture, threat model, troubleshooting, and support escalation.

`.org` publishes user and Scout guides; `.dev` publishes contracts, architecture,
and contributor material. In-app help links to the exact versioned guide.

## Preview-owner feedback included in this program

The Windows/shared-client work must include the already captured feedback rather
than postponing it behind packaging:

- automatic synchronization during connected online use and after reconnect;
- permanent no-signal installed-PWA/client launch regression coverage;
- visible safe-update notification;
- clickable Overview cards;
- discoverable member administration;
- discoverable backup/restore;
- intelligent field controls and queen marking/year behavior;
- accessible hive equipment-stack visualization;
- beekeeping glossary;
- inspection weather context; and
- cross-device authentication/session clarity.

## Acceptance gates

- Clean Windows user profile installs and runs standalone without development tools,
  WSL, Docker, Linux, or an external account.
- Standalone survives offline relaunch, app/service crash, update, rollback, backup,
  clean restore, keep-data uninstall, reinstall, and full removal.
- Scout deploys a connected backend and optional web frontend from Windows to both
  Cloudflare and a clean Linux target without requiring typed Linux commands.
- The current Windows installation imports the profile and connects without secrets
  in plan/profile/log/diagnostics.
- Standalone records and media migrate exactly once, resume after interruption, and
  either verify completely or roll back with the original installation usable.
- Windows, web PWA, future mobile clients, and both backends pass shared API/sync/
  authorization/media conformance.
- Client, backend, and Scout updates independently verify compatibility, preserve
  pending work, back up data, health-check, and recover.
- All user/operator/developer guides, Lucid sources/exports, threat models, release
  notes, changelogs, and sanitized UAT evidence are published before promotion.

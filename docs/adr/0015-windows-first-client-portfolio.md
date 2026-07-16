# ADR 0015: Windows-First Client Portfolio

## Status

Accepted

## Date

2026-07-16

## Acceptance

Accepted by the project owner as the post-Preview product direction. This does not
retroactively change the Public Preview 1 artifact or its GA gates.

## Context

The browser PWA proves the shared product, offline model, and server profiles, but a
family-oriented Windows user should not need Linux, WSL, Docker, SSH, DNS, or a
cloud account to begin. The same user may later want family synchronization across
Windows, web, iPhone, and Android without replacing the product or abandoning local
data.

Creating a separate repository for every product client would split domain logic,
offline fixes, API compatibility, and release coordination before those boundaries
are mature. Scout Bee is different: it is a privileged deployment manager with an
independent release lifecycle and therefore belongs in its own repository under
ADR 0014.

## Decision

Windows becomes the default packaged personal/family client after Preview 1. It has
two supported modes:

1. **Standalone:** a packaged Windows client plus a private, embedded local
   ApiaryLens service using the shared SQLite schema and filesystem media. It binds
   only to loopback, requires no external account or server, works offline, and is
   backed up and updated as one local installation.
2. **Connected:** the same Windows client connects over publicly trusted HTTPS to a
   compatible ApiaryLens backend deployed to Cloudflare or Compose on owned/local/
   cloud Linux infrastructure. The deployment may also include the web frontend for
   browser, iPhone PWA, Android browser/PWA, and family access.

The core monorepo owns product clients and shared product code:

```text
apps/
  web/       browser and installable PWA
  windows/   packaged Windows client and host integration
  ios/       future iPhone/iPad client
  android/   future Android client
  api/       portable Node backend
  worker/    Cloudflare backend
```

Product clients remain in the monorepo initially. A client moves to a separate
repository only through a later ADR when independent ownership, release cadence,
security boundary, or toolchain isolation outweighs shared-code and compatibility
costs.

Scout Bee:

- installs and updates the Windows package;
- creates/verifies local backups for standalone mode;
- optionally deploys the backend and web frontend to Cloudflare or Linux over SSH;
- writes a secret-free connection profile that the Windows app imports;
- guides an explicit standalone-to-connected migration/synchronization process;
- updates the client and backend independently but verifies compatibility first;
- repairs, rolls back, restores, diagnoses, and uninstalls each selected component;
  and
- may later expose safe mobile orchestration, without bypassing platform stores or
  requiring deployment secrets to persist on a phone.

The Windows host framework is intentionally not selected by this ADR. A focused
spike will compare Electron, a WebView2 host with a bundled sidecar, Tauri, and
Windows App SDK against package size, accessibility, offline storage, background
sync, auto-update, signing, local-service supervision, Node 24/SQLite reuse,
licensing, and clean-machine installation. Framework-dependent UI code waits for
that decision. Framework-neutral connection and mode contracts also wait for
explicit implementation authorization after the project plan and tracking dashboard
are accepted.

## Data and Identity Rules

- Standalone data is not silently switched to a remote URL. Connecting requires a
  verified backup, compatible server, authenticated owner, explicit transfer/sync
  choice, conflict preview, and completion evidence.
- Connection profiles contain no passwords, session tokens, API tokens, private
  keys, or deployment credentials.
- Connected-client authentication uses the native-client authorization design to be
  accepted before release; secure web cookies are not copied into application
  configuration.
- A disconnected connected client remains offline-capable using the shared local
  store and outbox, then automatically synchronizes after connectivity and a valid
  session return.
- Standalone backups include relational data, media, local configuration references,
  release identity, and restore verification metadata.

## Options Considered

### PWA remains the only default client

Lowest packaging cost, but keeps installation, storage, update, and Windows
integration confusing for the target family user.

### Separate repository for each client

Offers toolchain isolation but creates immediate contract drift and duplicate
offline/domain fixes. Revisit only when measured ownership or release needs justify
it.

### Windows-first clients in the product monorepo — selected

Maximizes shared product behavior and gives Windows families a simple starting path
while retaining optional connected web/mobile access.

## Consequences

- Windows packaging, signing, updates, backup, restore, and clean-profile testing
  become first-class release work.
- The backend/web remain the portable bones of every connected family installation;
  they are optional for a standalone Windows user, not deprecated.
- Native iOS and Android clients align to the same connection, sync, and portability
  contracts after Windows proves them.
- Automatic synchronization, update notices, member management, backup/restore
  visibility, and offline-launch fixes are shared-product requirements rather than
  Windows-only patches.
- The roadmap must defer lower-priority expansion while the Windows/Scout platform
  foundation is built.

## References

- [ADR 0008](0008-mvp-application-platform.md)
- [ADR 0009](0009-data-storage-and-offline-sync.md)
- [ADR 0014](0014-scout-bee-separate-repository-and-release.md)
- [Windows-first client and deployment design](../deployment/windows-first-client-and-scout-bee.md)

# ADR 0016: Electron Windows Host and Current-User Package

## Status

Proposed

## Date

2026-07-16

## Deciders

ApiaryLens project owner after the `WIN-003`, `WIN-004`, and `WIN-005` acceptance
conditions below are satisfied. This proposal does not authorize product
implementation.

## Context

ADR 0015 makes a packaged Windows client the default post-Preview family experience
but intentionally leaves its host and package open. The client must reuse the React
application and portable Node 24/SQLite backend, operate standalone without Linux or
cloud services, connect to a compatible remote backend, remain usable offline, and
install for a normal Windows user without Go, Node, Rust, .NET SDK, WSL, Docker, or a
Linux shell.

`WIN-003` compared Electron, Tauri 2 with a packaged Node sidecar, a custom WebView2
host, and native WinUI. Exact hosted-Windows evidence includes packaging, clean
current-user installation, test signing, `node:sqlite`, upgrade/downgrade/repair,
uninstall, SQLite recovery algorithms, SBOM generation, and automated shared-UI
accessibility. The evidence-weighted result is Electron 390/500 and Tauri 380/500.

Electron has the larger footprint, but directly carries the runtime used by the
existing application and does not add WebView2 acquisition or a second product-
application packaging boundary. The Tauri probe has a much smaller installer but
packages only the Node executable; it has not yet packaged and supervised the exact
ApiaryLens server and dependency graph.

Neither finalist is release-ready. Electron's measured Squirrel package leaves a
small updater/cache directory and its Forge build reaches an exotic Git dependency
that conflicts with repository supply-chain policy. Neither candidate installed a
complete third-party notice bundle. Host-specific token isolation, Credential
Manager integration, retail Windows accessibility, and physical lifecycle tests
also remain open.

Subsequent research run
[`29554694681`](https://github.com/ApiaryLens/apiarylens/actions/runs/29554694681)
packaged the real portable ApiaryLens server, database, and media adapters in a
physical 1,415-file runtime tree. Both the loose packaged application and a clean
current-user installation started the real service on `127.0.0.1`, created
disposable SQLite/media state, served protected health through a one-method
sandboxed bridge, rejected an untrusted sender, exposed no control token through
the tested renderer/storage/console/argument/readiness/output surfaces, and shut
down with exit 0. This materially advances conditions 1 through 3 but does not
complete their full API, organization-isolation, migration, crash/recovery, or
credential-adapter matrices.

Follow-on run
[`29555804486`](https://github.com/ApiaryLens/apiarylens/actions/runs/29555804486)
then passed 50 production-dependency-only assertions from both the packaged and
clean-installed artifact: protected bootstrap, CSRF and deduplication,
cross-organization read/write/media/member/export isolation, session rotation and
recovery, viewer denial, private original/thumbnail/export/deletion, migration head
`0004`, real-service restart, reauthentication, and SQLite/media persistence. This
closes the current-schema installed API and organization-isolation portion of
condition 1. Historical and failed migration transitions, complete host crash and
recovery integration, and the other conditions below remain open.

Run
[`29557057421`](https://github.com/ApiaryLens/apiarylens/actions/runs/29557057421)
then integrated host ownership and failure recovery into both artifact forms. The
packaged and clean-installed host rejected a second instance, lost its embedded
service when the primary host was forcibly killed, rejected and removed the
resulting dead-PID readiness record on the next launch, restarted in the same local
directory, replaced readiness only after recovery, and shut down cleanly. Both
artifacts retained the 50-check API matrix. This materially advances condition 3;
forced-write/data-lock faults, Job Object policy, and the broader Windows lifecycle
matrix remain open.

Run
[`29557388536`](https://github.com/ApiaryLens/apiarylens/actions/runs/29557388536)
then passed Electron's main-process, current-user DPAPI-backed `safeStorage`
store/read/rotate/corruption/delete lifecycle from both packaged and clean-installed
artifacts. Neither generated credential appeared in the tested renderer globals,
browser storage, console, arguments, readiness, or service output, and only booleans
entered evidence. This advances conditions 2 and 4 without deciding the final
Credential Manager versus `safeStorage` adapter or proving rotation-crash,
revocation, restore, Windows-account-change, and uninstall-policy behavior.

Run
[`29557772561`](https://github.com/ApiaryLens/apiarylens/actions/runs/29557772561)
then forced both packaged and clean-installed hosts to terminate after writing a
protected replacement and secret-free journal but before committing rotation. The
next launch validated the purpose/version state, promoted the protected replacement,
removed pending state, deleted a revoked connected session, retained hive data on
sign-out/keep-data, and removed both protected credentials and hive data on
remove-all. This advances condition 4. The proposed initial adapter is now
Electron's supported current-user DPAPI-backed `safeStorage` with versioned purpose
envelopes and an atomic journal; Credential Manager remains a fallback rather than
a parallel store. Server-integrated rotation, backup/restore, Windows-account
changes, actual installer choices, and owner acceptance remain open.

Run
[`29558246781`](https://github.com/ApiaryLens/apiarylens/actions/runs/29558246781)
then connected the selected adapter to the real API lifecycle in both packaged and
clean-installed artifacts. Bootstrap protected the issued HttpOnly session, the
real refresh route replaced it, recovery revocation deleted it, restart sign-in
protected the new session, and sign-out removed protected state. The raw session did
not enter the tested renderer, storage, console, arguments, readiness, service
output, or evidence surfaces. Backup/restore, Windows-account changes, actual
installer choices, supported retail profiles, and owner acceptance remain open.

Run
[`29558629887`](https://github.com/ApiaryLens/apiarylens/actions/runs/29558629887)
then passed two exact installed retention cycles: default uninstall retained the
protected standalone root and hive data, reinstalling the same artifact decrypted
and read both as the same Windows user, explicit remove-all deleted both, and the
second uninstall removed its registration and host. This advances conditions 4 and
6. Final user-facing choice/confirmation UX and updater/cache cleanup policy remain
open.

Run
[`29558987057`](https://github.com/ApiaryLens/apiarylens/actions/runs/29558987057)
then deleted the active protected standalone root after reinstall, restored it from
the retained DPAPI-protected backup, and decrypted the same purpose/version envelope
before remove-all. This closes same-user protected-backup mechanics; guided
cross-user/computer failure, Windows-account changes, final UX, retail profiles, and
production signing remain open.

## Proposed Decision

Use **Electron** as the initial Windows Preview host. Use a **signed per-user
Squirrel Setup executable and its immutable full-package/update metadata** as the
initial package format only after the acceptance conditions in this ADR close.
Scout Bee discovers and verifies the package through the ApiaryLens product release
manifest and orchestrates installation and lifecycle operations.

The released application:

- bundles its exact Electron/Chromium/Node runtime and the exact ApiaryLens server,
  migrations, web assets, and required notices;
- requires no developer runtime or administrator privilege for normal install,
  launch, update, repair, rollback, or uninstall;
- loads only packaged local application content in a sandboxed renderer with context
  isolation and Node integration disabled;
- exposes a versioned, allowlisted, sender-validated preload API and never exposes a
  reusable service or connected-session credential to ordinary renderer JavaScript;
- lets the Electron main process supervise one real local service owner, bind it
  explicitly to `127.0.0.1` on an operating-system-assigned port, and attach the
  process-scoped control credential outside renderer code;
- uses the shared portable API, SQLite store, filesystem media store, contracts, and
  organization-authorization behavior rather than creating a desktop-only backend;
- stores durable standalone and connected credentials through main-process
  `safeStorage` using versioned, purpose-scoped protected files, current-user ACLs,
  and an atomic recovery journal; and
- keeps standalone data, media, backups, cached verified releases, and package
  residue outside the executable installation directory under documented per-user
  locations with explicit keep-data and remove-all-data behavior.

The application may detect and announce an available update, but package-manager
success is not the safety boundary. Scout or the approved local lifecycle
coordinator must verify release identity, signature, checksum, attestation,
compatibility, available space, and backup before quiescing the application and
running Squirrel. It then runs migration and health checks before committing the
new version. Direct downgrade execution remains blocked unless the manifest and
verified backup declare it safe.

The initial support baseline is fully patched x64 Windows 11 editions within
Microsoft servicing. Windows 10 22H2 with applicable ESU and in-lifecycle Windows 10
LTSC remain conditional Preview profiles until their exact package, accessibility,
recovery, and security evidence passes. ARM64 and 32-bit Windows are not implied by
framework availability.

Production releases require Authenticode signatures on the packaged host and outer
setup, a trusted timestamp, signer verification before execution and after install,
and signed/attested release manifests, SBOMs, and notice bundles. Test-signing
evidence does not satisfy production trust.

## Options Considered

### Electron with per-user package — proposed

| Dimension | Assessment |
|---|---|
| Existing code reuse | Strongest; React, Node 24, and `node:sqlite` use the host's bundled runtime |
| Family installation | One offline-capable package; no shared browser/runtime prerequisite |
| Security | Acceptable only with sandbox, context isolation, narrow preload, sender validation, and host-owned credentials |
| Footprint | Weakest measured finalist: approximately 133.8 MiB setup and 467 MiB installed research footprint |
| Lifecycle | Exact install, upgrade, downgrade, repair, and uninstall mechanics measured; product gates still required |
| Supply chain | Unresolved Forge/Squirrel exotic dependency and notice reconciliation block acceptance |

### Tauri 2 with packaged Node sidecar

| Dimension | Assessment |
|---|---|
| Existing code reuse | React reuses cleanly; exact server application packaging and supervision remain unproven |
| Family installation | 24.3 MiB online setup and 96.7 MiB installed, but depends on Evergreen WebView2 |
| Security | Strong capability model; privileged commands and sidecar still require narrow design and negative tests |
| Offline remediation | Measured 221.1 MiB package shape; genuinely missing/policy-disabled WebView2 remains unproven |
| Lifecycle | NSIS transition mechanics measured; product compatibility and recovery gates remain identical |
| Supply chain | Larger Rust/npm graph, missing notices, and WebView2 redistribution review remain open |

Retain Tauri as the revisit candidate if it later packages and supervises the exact
server with lower total operational risk and complete WebView2, license, update,
and accessibility evidence. Do not maintain parallel Electron and Tauri product
clients.

### Custom WebView2 host with packaged Node sidecar

Rejected for the initial client. It would require ApiaryLens to create and maintain
its own privileged bridge, navigation policy, updater integration, packaging,
runtime remediation, and process supervision while retaining Tauri's WebView2 and
sidecar risks.

### Native WinUI client

Rejected for the initial client. It duplicates the React UI and fragments offline,
accessibility, validation, and synchronization behavior. Individual Windows APIs
remain appropriate behind the Electron main-process boundary.

### PWA-only Windows experience

Rejected by ADR 0015. It does not provide the standalone installation, local
lifecycle, backup, credential, and family-friendly starting experience required by
the Windows-first direction.

## Trade-off Analysis

Electron spends download, disk, and patching cost to reduce architecture and
delivery risk. Tauri spends build, sidecar, WebView2, and cross-runtime integration
complexity to reduce per-application footprint and strengthen the default command
boundary. For the initial Preview, reusing the exact Node runtime and avoiding a
shared runtime prerequisite outweighs Tauri's footprint advantage only if the
Electron security and supply-chain conditions close without weakening policy.

Squirrel is proposed because it is the only Electron current-user mechanism with
exact signed lifecycle evidence in this research. It is not trusted to decide
schema compatibility, rollback, or data deletion. If its exotic dependency cannot
be resolved under repository policy or its residue cannot meet explicit uninstall
behavior, this ADR returns to Proposed and a separately measured package mechanism
must replace it.

## Consequences

- One Windows host implementation is built; Tauri remains research, not a second
  product client.
- The core monorepo keeps the Windows client and shared code under ADR 0015.
- Chromium/Electron security updates become an ApiaryLens release-cadence
  responsibility; release monitoring and expedited patch channels are mandatory.
- Windows downloads and installed footprint are larger than the Tauri challenger.
- The browser PWA, portable backend, Cloudflare profile, and Compose profile remain
  first-class; the Electron host is an adapter, not the product architecture.
- Scout and the Windows app retain independent versions while product release
  metadata declares their compatibility.
- Package data retention becomes explicit: uninstall defaults to keep data only
  when clearly presented, while remove-all-data securely removes credentials,
  database, media, backups selected by the user, and safe updater residue.
- Native iOS and Android clients remain future work and do not inherit Electron.

## Acceptance Conditions Before This ADR Can Become Accepted

1. Package the exact built ApiaryLens server and dependencies inside the Electron
   candidate and pass the real API, organization-isolation, media, migration, and
   standalone lifecycle suites from the installed artifact.
2. Prove the sandboxed preload/main bridge keeps local-control and connected-session
   credentials out of renderer globals, browser storage, DevTools-visible messages,
   arguments, logs, diagnostics, and crash evidence. The packaged and installed
   `safeStorage` lifecycle now passes the tested renderer/storage/console/argument/
   readiness/service-output surfaces; final diagnostics and crash evidence remain.
3. Integrate and replay the `WIN-004` loopback, ownership, ACL/reparse, stale-
   readiness, corrupt-database, crash, shutdown, and recovery matrix in the actual
   Electron host; complete forced-write/data-lock faults, Job Object policy, and the
   broader Windows lifecycle evaluation. Single-instance, parent-death,
   stale-readiness recovery, and clean shutdown now pass in packaged and installed
   artifacts.
4. Integrate and replay the `WIN-005` DPAPI, rotation/crash, revocation, restore,
   sign-out, keep-data, and remove-all behavior through the actual main-process
   adapter. The proposed adapter is Electron `safeStorage`; Credential Manager is a
   fallback that does not require selected-host integration unless this decision is
   reopened. The packaged and installed `safeStorage`
   store/read/rotate/corruption/delete baseline and synthetic interrupted-rotation,
   revocation, sign-out, keep-data, and remove-all state machine now pass. Real
   server issue/refresh/revocation/restart/sign-out now passes as well. Restore and
   account-change behavior, final installer-choice UX, and owner acceptance stay
   open. Exact default keep-data, same-user reinstall/decrypt, protected backup
   restore, explicit remove-all, and second-uninstall mechanics now pass.
5. Resolve or reject the Forge/Squirrel exotic dependency under the repository
   supply-chain policy; reconcile every runtime/build component to an allowlisted
   license and install complete Apache-2.0 and third-party notices.
6. Prove complete current-user uninstall and both explicit data-retention choices,
   including the measured updater/cache residue. Default keep-data,
   same-user reinstall/decrypt, explicit remove-all, and a second uninstall now
   pass; final UI choices and updater/cache policy remain.
7. Pass exact signed-package UAT on supported retail Windows profiles: keyboard,
   high contrast, 200%/400% zoom, reduced motion, NVDA, native dialogs, updates,
   recovery, sleep/resume, sign-out, shutdown, multiple sessions, and locked screen.
8. Update the authoritative Lucidchart Windows host/service/security diagrams and
   publish accessible public exports before implementation approval.

The seven-page authoritative Windows and Scout diagram set is now filed and its
accessible exports are published in
[Windows Client and Scout Bee Architecture](../diagrams/windows-scout-architecture.md).
This completes the diagram artifact portion of condition 8; owner review and the
remaining acceptance conditions still prevent this ADR from becoming Accepted.

## Revisit Conditions

Reopen the host or package decision if Electron cannot satisfy a condition above,
its supported Windows baseline changes, Chromium patch cadence becomes
unsustainable, measured family-device performance is unacceptable, package size
materially blocks adoption, or Tauri proves the exact product lifecycle with lower
total risk. Any change requires a superseding ADR and compatible migration path for
installed data and release channels.

## References

- [ADR 0015](0015-windows-first-client-portfolio.md)
- [Windows host and package research](../research/2026-07-16-windows-host-and-package-spike.md)
- [Windows local-service security research](../research/2026-07-16-windows-local-service-security-spike.md)
- [Windows credential-protection research](../research/2026-07-16-windows-native-credential-protection-spike.md)
- [Windows-first client and Scout Bee design](../deployment/windows-first-client-and-scout-bee.md)
- [WIN-003](https://github.com/ApiaryLens/apiarylens/issues/7)
- [WIN-004](https://github.com/ApiaryLens/apiarylens/issues/4)
- [WIN-005](https://github.com/ApiaryLens/apiarylens/issues/8)

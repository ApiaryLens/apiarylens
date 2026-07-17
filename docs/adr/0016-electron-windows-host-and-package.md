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
accessibility. The evidence-weighted result is Electron 395/500 and Tauri 380/500.

Electron has the larger footprint, but directly carries the runtime used by the
existing application and does not add WebView2 acquisition or a second product-
application packaging boundary. The Tauri probe has a much smaller installer but
packages only the Node executable; it has not yet packaged and supervised the exact
ApiaryLens server and dependency graph.

Neither finalist is release-ready. Electron's measured Squirrel package leaves a
small updater/cache directory. The initial Forge build reached an exotic Git
dependency, but exact follow-up packaging removed it with an integrity-pinned npm
registry override and a release-failing zero-Git-reference assertion. Neither
candidate was initially complete on third-party notices; exact Electron follow-up
now installs a hashed top-level runtime notice bundle and reconciled runtime/build
CycloneDX inventories. Tauri notice coverage, final installer-vendor binary review,
retail Windows accessibility, physical lifecycle tests, production signing, and
signed provenance remain open.

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

Run
[`29562748266`](https://github.com/ApiaryLens/apiarylens/actions/runs/29562748266)
then used the exact clean-installed host under a disposable second Windows account.
The creating account passed a `safeStorage` round trip, the second account was denied
decryption, and the account, Windows profile, copied host, ciphertext lab, and logs
were removed. Only aggregate booleans entered green evidence. This closes installed
different-user denial mechanics; final guided recovery UX, Windows password/PIN and
local-to-Microsoft-account transitions, retail profiles, and production signing
remain open.

Run
[`29566771213`](https://github.com/ApiaryLens/apiarylens/actions/runs/29566771213)
then used a disposable local Windows account to create a `safeStorage` fixture with
the exact clean-installed host, changed that account's password through the normal
`NetUserChangePassword` API, and decrypted the fixture under the same SID with the
new password. The same temporary account remained unable to decrypt the runner
account's fixture, and account/profile/lab cleanup passed. Setup SHA-256 was
`0A632B130B05A1DB4003892C6DF97D59302BD7AC112A8ED38FE5E3CFAF6C8E85`.
This closes the hosted normal local-password-change experiment. Windows Hello PIN,
administrator reset, local-to-Microsoft-account, domain/Entra, retail-profile,
guided recovery, and production-signing evidence remain open.

Run
[`29567849241`](https://github.com/ApiaryLens/apiarylens/actions/runs/29567849241)
then reset the same disposable account's password through the administrator path
after the normal password-change round trip. The same SID was denied decryption of
its prior `safeStorage` fixture, different-user denial remained intact, and complete
account/profile/lab cleanup passed. Setup SHA-256 was
`80EB4E9FE5117107EC0E54786FEC612E9FA3E802BB13EE80E65832902EC2D41C`.
The implementation consequence is explicit: preserve local hive data and require
guided reauthentication or recovery when protected credentials become unreadable;
never convert credential loss into data deletion or weaker authorization. Windows
Hello PIN, Microsoft-account/domain/Entra transitions, retail profiles, final UX,
and production signing remain open.

The exact commit's first attempt
[`29567508045`](https://github.com/ApiaryLens/apiarylens/actions/runs/29567508045)
timed out in the unchanged packaged bridge probe before credential execution; the
exact rerun passed. This remains input to the open startup-timeout/crash-loop and
retail-profile gates rather than acceptance evidence for them.

Run
[`29563619105`](https://github.com/ApiaryLens/apiarylens/actions/runs/29563619105)
then forced `@electron/rebuild` 4.2.0 through an integrity-pinned npm registry lock
entry and failed the release path for any `git+ssh` or `git+https` reference. The
retained exact lock contained zero exotic Git references. Electron Forge 7.11.2
still built the Squirrel artifact, and setup SHA-256
`1FB5341345263200BD690ACE373306DF83751901D570B225455D60DD868EABCC` passed the
complete clean-profile installed lifecycle, including different-user credential
denial and cleanup. This closes the exotic-dependency mechanism gate without
weakening repository policy. Notice/SBOM reconciliation remained open after this
run and is addressed by the following evidence; signed provenance and production
signing remain open.

Run
[`29565064135`](https://github.com/ApiaryLens/apiarylens/actions/runs/29565064135)
then packaged and probed the exact Electron/Chromium/Node runtime before generating
the installer. It reconciled declared licenses and npm registry integrity for all
414 build entries, mapped all 13 top-level runtime components to nine installed,
hashed license/notice files, and retained zero exotic Git references. The clean-
install job independently verified every hash and SBOM count before passing the
complete API/security/credential and uninstall/reinstall lifecycle. Setup SHA-256
was `A40D49122EDBEBC084955C8780687FB3CE24578E85924CE28C0DEE6CB6289CB2`.
This closes the automated top-level Electron notice and manifest gap. Final
installer-vendor binary review, signed provenance, production signing, and retail
evidence remain open.

Run
[`29565936418`](https://github.com/ApiaryLens/apiarylens/actions/runs/29565936418)
then loaded the real bundled migrations in both packaged and clean-installed forms.
Upgrades from `0001`, `0002`, and `0003` reached `0004`, preserved the owner
organization, backfilled the bootstrap claim, retained exact expected checksums,
and passed integrity. An incompatible `0004` rejected readiness without advancing
the ledger or losing committed data, and an explicit repair/retry reached `0004`.
The run also exposed [WIN-026](https://github.com/ApiaryLens/apiarylens/issues/47):
a deliberately wrong recorded `0003` checksum was accepted at readiness and
remained stored because the current migration ledger is not validated before
`INSERT OR IGNORE`. Historical and failed-migration mechanics advance, but
condition 1 remains open until immutable-prefix checksum validation, atomic ledger
writes, and the remaining negative fixtures are implemented and proven.

Run
[`29559517037`](https://github.com/ApiaryLens/apiarylens/actions/runs/29559517037)
then forced the embedded service to terminate with an open real-database transaction
in both packaged and clean-installed forms. The same data directory restarted,
passed `PRAGMA integrity_check`, retained committed state, rolled back interrupted
state, and rejected a separate corrupt database before readiness. This materially
advances condition 3; disk-full, read-only, startup-timeout/crash-loop policy, and
the broader Windows lifecycle matrix remain open.

Run
[`29560309984`](https://github.com/ApiaryLens/apiarylens/actions/runs/29560309984)
then proved a deterministic `SQLITE_FULL` transaction is rejected without partial
state and with integrity preserved, and that an actual Windows ACL-denied data
directory is rejected before readiness, in both packaged and clean-installed forms.
The database-full case uses SQLite's page-count limit rather than filling a physical
volume. This further advances condition 3; physical-volume-full behavior, startup
timeout/crash-loop policy, Job Object policy, and the broader Windows lifecycle
matrix remain open.

Run
[`29560930136`](https://github.com/ApiaryLens/apiarylens/actions/runs/29560930136)
then proved that both exact forms can terminate a child that misses a deterministic
research readiness deadline, stop after a three-attempt pre-readiness crash budget,
avoid false readiness and orphaned children, and recover the same directory only on
an explicit retry. The 400 ms injected deadline is a test control, not a proposed
production value. This closes the host mechanism subgate; production timeout/backoff
values, recovery UX, Job Object policy, physical-volume-full behavior, and broader
retail lifecycle evidence remain open.

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
  and an atomic recovery journal;
- keeps standalone data, media, backups, cached verified releases, and package
  residue outside the executable installation directory under documented per-user
  locations with explicit keep-data and remove-all-data behavior; and
- uses a non-detached service, host-owned graceful shutdown, child parent-PID polling,
  dead-PID readiness recovery, and bounded startup attempts. The initial Preview does
  not add a native Windows Job Object binding or bootstrap launcher solely for child
  cleanup. Reopen that policy if retail testing reproduces an orphan or the selected
  package supplies a maintained signed containment primitive without a new runtime.

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
| Supply chain | Registry-only exact lock plus installed runtime/build SBOM and hashed notice reconciliation measured; final vendor-binary review, signed provenance, and production signing still block acceptance |

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
schema compatibility, rollback, or data deletion. The exotic dependency is now
removed by the measured exact override and lock assertion. If that invariant cannot
be preserved in the product lock, or if Squirrel residue cannot meet explicit
uninstall behavior, this ADR returns to Proposed and a separately measured package
mechanism must replace it.

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
   standalone lifecycle suites from the installed artifact. Current and historical
   upgrades plus failed-migration repair/retry pass; `WIN-026` checksum, unknown-
   ahead, skipped-version, and out-of-order ledger rejection remain open.
2. Prove the sandboxed preload/main bridge keeps local-control and connected-session
   credentials out of renderer globals, browser storage, DevTools-visible messages,
   arguments, logs, diagnostics, and crash evidence. The packaged and installed
   `safeStorage` lifecycle now passes the tested renderer/storage/console/argument/
   readiness/service-output surfaces; final diagnostics and crash evidence remain.
3. Integrate and replay the `WIN-004` loopback, ownership, ACL/reparse, stale-
   readiness, corrupt-database, crash, shutdown, and recovery matrix in the actual
   Electron host; complete forced-write/data-lock faults, Job Object policy, and the
   broader Windows lifecycle evaluation. Single-instance, parent-death,
   stale-readiness recovery, clean shutdown, forced-write/WAL rollback, integrity,
   committed-state retention, and corrupt-startup rejection now pass in packaged
   and installed artifacts. Deterministic `SQLITE_FULL` rejection and actual Windows
   ACL-denied startup also pass. Bounded readiness timeout, a three-attempt
   pre-readiness crash budget, and explicit-retry recovery pass in both exact forms.
   Production timeout/backoff values and recovery UX, physical-volume-full behavior,
   and broader Windows lifecycle behavior remain. The Preview Job Object policy is
   explicit: no native binding absent a reproduced orphan or package-native primitive.
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
   restore, installed different-user denial, explicit remove-all, and second-uninstall
   mechanics now pass. Password/PIN and local-to-Microsoft-account transitions plus
   guided recovery UX remain open.
5. Preserve the measured registry-only Electron rebuild lock and release-failing
   zero-Git-reference assertion. Preserve the measured 414-build-entry and
   13-runtime-component SBOM/notice reconciliation; complete final installer-vendor
   binary review and sign/attest the evidence with production release artifacts.
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
- [ADR 0017: Windows native authentication and credential protection](0017-windows-native-authentication-and-credential-protection.md)
- [Windows-first client and Scout Bee design](../deployment/windows-first-client-and-scout-bee.md)
- [WIN-003](https://github.com/ApiaryLens/apiarylens/issues/7)
- [WIN-004](https://github.com/ApiaryLens/apiarylens/issues/4)
- [WIN-005](https://github.com/ApiaryLens/apiarylens/issues/8)
- [WIN-026](https://github.com/ApiaryLens/apiarylens/issues/47)

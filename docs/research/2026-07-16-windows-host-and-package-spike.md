# Windows Host and Package Research Spike

## Status

`WIN-003` is in progress. The owner authorized research and follow-on ADR work on
2026-07-16. This record does not select a framework or authorize product code.

Official-source review plus comparable Electron and Tauri/WebView2 packaging,
test-signing, exact-artifact clean-install and package-transition lifecycle,
SQLite recovery, SBOM inventory, and automated shared-UI accessibility baselines
are complete. Packaged and clean-installed Electron preload/main-process isolation
now starts the real portable ApiaryLens service for a protected health probe and
disposable SQLite/media creation. Exact API, organization-isolation, media,
credential, recovery, current-user uninstall/reinstall, shared-window service,
IPv6-loopback rejection, and environment-proxy non-interception replay now passes.
Retail Windows profiles, host accessibility, integrated power-loss behavior,
migration-ledger checksum rejection, production signing and attestation, final
binary license review, and owner ADR acceptance remain required before the spike
can close. Authenticated local-service supervision continues separately under
`WIN-004`.

## Question

Which Windows host and package design gives a family beekeeper a signed application
that works standalone and connected, requires no development tools, preserves the
existing React/TypeScript and Node SQLite investment, remains accessible, and can be
updated and recovered safely?

## Constraints and acceptance criteria

The selected design must:

- install and run for a normal Windows user without Go, Node, Rust, .NET SDK, WSL,
  Docker, a Linux shell, or administrator-only daily operation;
- run the React client and the portable Node 24/`node:sqlite` backend locally in
  standalone mode, without rewriting domain, database, synchronization, or
  authorization behavior;
- connect the same client to a Scout-managed Cloudflare or Compose backend;
- keep browser content below an explicit privilege boundary;
- support signed, verified, resumable updates with backup-before-update and
  recoverable rollback;
- support Windows 11 and the supported Windows 10 baseline chosen by the release
  ADR;
- pass keyboard, high-contrast, 200%/400% zoom, reduced-motion, and screen-reader
  tests;
- use Apache-2.0-compatible runtime and packaging dependencies with documented
  notices and provenance; and
- produce immutable artifacts that Scout Bee can discover, verify, cache, install,
  repair, update, roll back, and uninstall.

Build-time SDKs are not end-user prerequisites. A Rust, C++, .NET, or Node build
toolchain can be acceptable in CI only if the released package is self-contained or
performs guided prerequisite remediation without requiring technical knowledge.

## Proposed Windows support baseline

Framework compatibility is not an ApiaryLens support promise. Electron publishes
Windows 10-and-newer binaries, and WebView2 documents Windows 10 and Windows 11
client compatibility, but Windows 10 Home and Pro left Microsoft's normal support
on 2025-10-14. Windows 10 ESU supplies security updates for enrolled 22H2 devices;
it does not restore normal product support, feature work, or unrelated fixes.

The release ADR should therefore use this baseline unless retail-profile evidence
contradicts it:

- Standard support: x64 Windows 11 Home, Pro, Enterprise, or Education releases that
  are still within Microsoft's servicing lifecycle and fully patched.
- Conditional Preview support: x64 Windows 10 22H2 enrolled in the applicable ESU
  program, plus Windows 10 LTSC editions that remain within their Microsoft
  lifecycle, only after exact-install, lifecycle, accessibility, and recovery tests.
- Unsupported: Windows releases outside Microsoft's servicing or ESU/LTSC lifecycle,
  32-bit Windows, and editions or architectures not named and tested by the release.
- ARM64 remains a separately measured target. Availability of Electron or WebView2
  ARM64 binaries does not make it supported before the full ApiaryLens package and
  native-dependency lifecycle passes on ARM64 hardware.

Preview documentation must state the exact tested Windows release, edition,
architecture, patch level, WebView2 state, and package artifact. The matrix is
re-evaluated for every supported product channel rather than freezing “Windows 10+
support” as an indefinite claim.

Primary sources checked 2026-07-16:

- [Windows 10 Home and Pro lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/windows-10-home-and-pro)
- [Windows 10 Extended Security Updates](https://learn.microsoft.com/en-us/windows/whats-new/extended-security-updates)
- [Windows 11 Home and Pro lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/windows-11-home-and-pro)
- [Windows 11 release information](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information)
- [Electron platform support](https://github.com/electron/electron#platform-support)
- [WebView2 supported Windows versions](https://learn.microsoft.com/en-us/microsoft-edge/webview2/)

## Existing ApiaryLens facts

- The web client is React, TypeScript, and Vite.
- The portable server is Node 24 and the Compose database adapter uses
  `node:sqlite`.
- The measured production web bundle on 2026-07-16 was 2.03 MiB across ten files,
  including source maps.
- The locally installed Node 24.18.0 executable was 88.2 MiB. That is a useful
  lower-bound indicator for any design that ships a Node runtime, not a predicted
  final sidecar size.
- This workstation had WebView2 Runtime 150.0.4078.65 installed. Its shared runtime
  directory occupied 848.4 MiB across 786 files. That shared system footprint must
  not be misreported as per-application package size.
- This workstation did not have the Rust or .NET SDK toolchains installed. They
  were deliberately not installed for this initial evidence pass.

## Options under evaluation

| Option | Host/runtime model | Existing-code reuse | Primary concern | Research disposition |
|---|---|---|---|---|
| Electron | Bundled Chromium plus Node; main, renderer, and optional utility processes | Highest; React and Node APIs are native to the host model | Large artifact/runtime footprint and fast Chromium/Electron patch cadence | Baseline measured; remains a finalist |
| Tauri 2 plus packaged Node sidecar | System WebView2, Rust host, capability-scoped IPC, packaged Node service | High for React; backend reuse depends on a reliable Node sidecar package | Second toolchain, sidecar lifecycle/IPC complexity, and WebView2 availability | Finalist; prototype required |
| Custom WebView2 host plus packaged Node sidecar | C++/.NET host over Evergreen WebView2 with custom IPC and supervision | High for React and backend, but all desktop integration is custom | Reimplements framework security, updater, IPC, packaging, and lifecycle work | Keep only as a control/challenger |
| Windows App SDK/WinUI native client | Native Windows UI and Windows App SDK deployment model | Low if UI is native; moderate only if it embeds WebView2, becoming the custom-host option | React UI duplication, Windows-only UI behavior, and additional runtime/package choices | Reject native UI for the first client; retain individual Windows APIs as integrations |

## Official-source findings checked 2026-07-16

### Electron

- Electron embeds Chromium and Node and supports a web renderer with a Node main
  process. This is the shortest path to the current React and Node implementation.
- Electron uses a multi-process model. The renderer does not need direct Node access;
  context isolation, sandboxing, narrow preload bridges, sender validation, blocked
  navigation, and current Electron releases are explicit security requirements.
- Electron recommends packaging and code signing before distribution. Windows
  updates can use MSIX or Squirrel-based packages through `autoUpdater`, but
  ApiaryLens would still wrap that mechanism in its product release manifest,
  backup, compatibility, health, and rollback contract.
- Electron is MIT licensed. Chromium and bundled components require their associated
  notices and license inventory.
- Electron exposes Chromium accessibility support, but framework support does not
  replace ApiaryLens NVDA, keyboard, contrast, and zoom acceptance tests.

Primary sources:

- [Electron introduction](https://www.electronjs.org/docs/latest/)
- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron process sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution/)
- [Electron distribution overview](https://www.electronjs.org/docs/latest/tutorial/distribution-overview)
- [Electron Windows updater](https://www.electronjs.org/docs/latest/api/auto-updater/)
- [Electron accessibility](https://www.electronjs.org/docs/latest/tutorial/accessibility)
- [Electron MIT license](https://github.com/electron/electron/blob/main/LICENSE)

### WebView2 and Tauri

- Production WebView2 applications use the WebView2 Runtime, not the Edge browser.
  Evergreen is included with Windows 11 and is present on most eligible Windows 10
  systems, but an installer must detect and remediate a missing runtime.
- Evergreen updates independently and is the preferred security/serviceability
  model. The app must save state and restart to adopt a newly installed runtime when
  required. Forward-compatibility testing and feature detection are mandatory.
- Fixed Version gives deterministic runtime control but adds more than 250 MB by
  Microsoft's current documentation, transfers browser servicing responsibility to
  ApiaryLens, and has extra Windows 10 permission requirements. It is not the default
  recommendation.
- Tauri's Windows installers can download or embed the Evergreen bootstrapper,
  include an offline installer, or bundle a fixed runtime. Its current guide reports
  approximately 127 MB added by the offline installer and approximately 180 MB for
  its fixed-version option; these documentation figures must be replaced by our own
  released-artifact measurements.
- Tauri uses a Rust core/WebView trust boundary and capability-scoped IPC. Core and
  plugin code still has native privileges, so commands, parameters, origins, and
  filesystem/process scopes require allowlists and negative tests.
- Tauri officially supports packaged external binaries and documents packaging a
  Node application as a self-contained sidecar. A sidecar removes the end-user Node
  prerequisite but adds process supervision, authenticated IPC, crash recovery,
  update atomicity, and provenance requirements.
- Tauri's updater produces signed update artifacts for MSI/NSIS packages and can use
  static release metadata. ApiaryLens must still enforce its own manifest identity,
  compatibility, backup, health, and rollback gates.
- Tauri code is MIT or Apache-2.0. The WebView2 runtime has separate Microsoft
  redistribution terms that must be included in distribution review.

Primary sources:

- [WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)
- [WebView2 security](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri security model](https://v2.tauri.app/security/)
- [Tauri Windows installers](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri updater](https://v2.tauri.app/plugin/updater/)
- [Tauri external binaries](https://v2.tauri.app/develop/sidecar/)
- [Tauri Node sidecar guide](https://v2.tauri.app/learn/sidecar-nodejs/)
- [Tauri licenses](https://github.com/tauri-apps/tauri)

### Windows App SDK

- Windows App SDK supports framework-dependent and self-contained deployment.
  Framework-dependent packages are smaller and serviced centrally but introduce a
  runtime prerequisite. Self-contained packages carry the runtime, are larger, and
  make the application responsible for servicing that runtime.
- Unpackaged framework-dependent applications also require bootstrap initialization
  and documented runtime prerequisites. Self-contained WinUI output is not
  necessarily one physical file because native runtime dependencies can remain
  alongside the executable.
- Windows App SDK is useful for selective Windows integrations, but a native WinUI
  rewrite would duplicate the existing React UI and fragment client behavior. A
  WinUI shell that only embeds WebView2 has the same custom IPC, updater, and
  supervision obligations as the custom WebView2 option.

Primary sources:

- [Windows App SDK deployment overview](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/deploy-overview)
- [Framework-dependent unpackaged deployment](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/deploy-unpackaged-apps)
- [Self-contained Windows App SDK deployment](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/self-contained-deploy/deploy-self-contained-apps)
- [Choose a Windows distribution path](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path)
- [Windows App SDK repository and license](https://github.com/microsoft/WindowsAppSDK)

### Node sidecar packaging

Node single-executable applications can distribute an application to a system that
does not have Node installed. The feature remains marked active development in the
current Node documentation. Its behavior with ApiaryLens dependencies,
`node:sqlite`, native modules, signing, source maps, diagnostics, and repeatable
builds must be proven before it becomes a release dependency.

Primary source:

- [Node single-executable applications](https://nodejs.org/api/single-executable-applications.html)

## Electron baseline measurement

The first prototype intentionally measured host overhead rather than implementing
desktop features. It packaged the current production web build into Electron
43.1.1 using `@electron/packager` 20.0.3. The renderer used sandboxing, context
isolation, no Node integration, and no preload bridge. No product source file was
changed; the disposable prototype remains outside the repository.

Test host: the maintainer's current Windows machine, warm filesystem cache after the
first launch. Five isolated launches were measured after waiting for every prior
process to exit.

| Metric | Result |
|---|---:|
| Uncompressed packaged directory | 349.2 MiB, 75 files |
| ZIP artifact, optimal PowerShell compression | 142.2 MiB |
| Main executable | 215.0 MiB |
| Renderer-ready time, runs | 278, 300, 288, 301, 314 ms |
| Renderer-ready mean / median | 296.2 / 300 ms |
| Peak process count | 4 |
| Mean peak combined working set | 235.6 MiB |
| Mean peak combined private memory | 84.5 MiB |

These are development-spike numbers, not product promises. The artifact is unsigned,
unoptimized, not an installer, includes the current source map, and was not tested
on a clean profile. Compression format, locale pruning, symbols, installer format,
code signing, antivirus scanning, the local Node service, SQLite, media, and real
data will change the final numbers.

The initial equivalent installer run
[`29542856476`](https://github.com/ApiaryLens/apiarylens/actions/runs/29542856476)
used Electron Forge 7.11.2 with Squirrel.Windows and retained its generated npm lock
file in the disposable runner lab. Forge currently reaches `@electron/node-gyp`
through a Git dependency; the repository's pnpm supply-chain policy correctly
rejected that exotic transitive dependency. The research workflow did not weaken
the product repository policy.

Follow-up run
[`29563619105`](https://github.com/ApiaryLens/apiarylens/actions/runs/29563619105)
resolved that narrow conflict without permitting Git dependencies. The disposable
Electron package pins `@electron/rebuild` 4.2.0, whose generated lock entry resolves
to the integrity-pinned npm registry tarball, and the release-path assertion fails
if any `git+ssh` or `git+https` reference remains. The retained exact lock contained
zero such references. The same run built setup SHA-256
`1FB5341345263200BD690ACE373306DF83751901D570B225455D60DD868EABCC`, then passed
the complete clean-profile install, packaged API/security/credential lifecycle,
keep-data uninstall, reinstall/restore, remove-all, and second-uninstall workflow.
This closes the exotic-dependency mechanism gate; the eventual product repository
must retain the exact override and lock assertions. License/notice/SBOM
reconciliation remained open after this run and is addressed by the later
`29565064135` evidence; signed provenance remains open.

| Installer metric | Result |
|---|---:|
| Squirrel setup executable | 133.8 MiB |
| Full NuGet package | 133.1 MiB |
| Loose application directory | 349.5 MiB, 75 files |
| Electron host executable | 215.0 MiB |
| Packaged `node:sqlite` probe | Passed |
| Renderer-ready runs | 176, 197, 169, 211, 172 ms |
| Renderer-ready mean / median | 185 / 176 ms |
| Process count / working set / private memory | 4 / 229.4 MiB / 87.5 MiB |

Lifecycle replay
[`29543131869`](https://github.com/ApiaryLens/apiarylens/actions/runs/29543131869)
downloaded the exact installer from that build run into a second fresh Windows
runner. The replay restricted `PATH` to Windows system directories and confirmed
that external Node, Rust, and .NET executables were unavailable.

| Clean-profile lifecycle check | Result |
|---|---:|
| Artifact SHA-256 verification | Passed |
| Silent current-user install | Exit 0 |
| Installed footprint before uninstall | 467.1 MiB, 81 files |
| Installed Electron host | 215.0 MiB |
| Installed `node:sqlite` probe | Passed; Electron 43.1.1 / Node 24.18.0 |
| Three-second installed-host smoke | Passed |
| Smoke process count / working set / private memory | 4 / 229.2 MiB / 87.2 MiB |
| Silent uninstall | Exit 0 |
| Installed host / uninstall registration after uninstall | Absent / absent |
| Remaining updater/cache directory | Present; 3.6 MiB |

The residual directory is not counted as a complete uninstall. A product design
must either remove safe updater residue or state precisely which recovery/cache data
is retained and provide an explicit remove-all-data choice. As with the Tauri run,
this is an unsigned research artifact on a hosted Windows runner rather than a
retail family computer.

### Electron test-signing evidence

Targeted run
[`29545351946`](https://github.com/ApiaryLens/apiarylens/actions/runs/29545351946)
created a runner-only 3072-bit RSA code-signing identity, signed both the packaged
Electron host and outer Squirrel setup, and verified that each embedded signer
matched the exact ephemeral certificate. The private key and certificate were not
uploaded and were destroyed with the hosted runner.

| Signing check | Result |
|---|---:|
| Packaged host signer | Exact ephemeral certificate present |
| Squirrel setup signer | Exact ephemeral certificate present |
| Host size change | +15,368 bytes |
| Setup size change | +53,760 bytes |
| Packaged `node:sqlite` after signing | Passed |
| Five renderer-ready launches after signing | Passed; mean 227.6 ms |
| Exact signed setup install / installed signer | Exit 0 / exact signer retained |
| Installed footprint | 467.3 MiB, 81 files |
| Installed `node:sqlite` / three-second host smoke | Passed / passed |
| Exact signed setup uninstall | Exit 0; host and registration absent |
| Updater/cache residue after signed uninstall | 4.3 MiB |

Windows reported `UnknownError` for trust status because the self-signed root was
deliberately not added to the runner's trusted-root store. This proves the packaging
and Authenticode embedding path, not publisher reputation, trusted timestamping, or
the production certificate chain. Those require the real CA-backed signing identity
and release workflow.

### Electron preload-bridge and uninstall-convergence evidence

Build run
[`29553663618`](https://github.com/ApiaryLens/apiarylens/actions/runs/29553663618)
packaged the current React bundle into Electron 43.1.1/Node 24.18.0 at commit
`032bd741c405eaf5f34c7ae81cd3174fa1069878`. A disposable preload exposed one
typed `health` method. The renderer sent no argument; the main process modeled
attaching its private per-launch credential and returned only status and protocol
identity.

| Electron bridge check | Result |
|---|---:|
| Renderer Node `process` | Absent |
| Renderer `require` | Absent |
| Exposed bridge keys | `health` only |
| Renderer-to-main arguments | 0 |
| Typed health result | 200; service protocol 1 |
| Untrusted `data:` document using the same preload | Rejected |
| Token in renderer globals or web storage | No |
| Token in console messages or process arguments | No |
| Packaged `node:sqlite` control | Passed |
| Five renderer-ready launches | Passed; 255.4 ms mean |

This proves the narrow Electron bridge primitive. It does not yet place the exact
ApiaryLens service or Credential Manager adapter behind that bridge, enumerate the
full typed desktop API, test navigation/pop-up/file-dialog policy, or prove that
production diagnostics and crash reporting redact secrets.

The parent workflow's first clean-install job then failed because Squirrel returned
exit 0 and removed uninstall registration while leaving the 225.5 MB installed host.
Replay
[`29553860691`](https://github.com/ApiaryLens/apiarylens/actions/runs/29553860691)
proved zero processes from the exact installation root before uninstall but still
retained the host. A second replay of the same installer and SHA-256,
[`29553925571`](https://github.com/ApiaryLens/apiarylens/actions/runs/29553925571),
passed: zero installed processes, uninstall convergence in 303 ms, host and
registration removed, and 3.8 MB known cache residue.

The passing replay did not erase the two failures, so repeated exact-artifact
convergence was required before interpreting the result.

Three additional independent clean-runner replays of that same immutable installer
then passed:

| Replay | Processes before uninstall | Convergence | Host / registration | Residual cache |
|---|---:|---:|---:|---:|
| [`29554024726`](https://github.com/ApiaryLens/apiarylens/actions/runs/29554024726) | 0 | 307 ms | Removed / removed | 10.0 MB |
| [`29554025881`](https://github.com/ApiaryLens/apiarylens/actions/runs/29554025881) | 0 | 312 ms | Removed / removed | 10.0 MB |
| [`29554026869`](https://github.com/ApiaryLens/apiarylens/actions/runs/29554026869) | 0 | 403 ms | Removed / removed | 10.0 MB |

All three verified SHA-256
`8FD007D03D730D6702EBDD0C8632FB4A420606D789B1E75D3D11D28008D69C9F`,
installed without an external developer runtime, and passed the installed
`node:sqlite` control. The strengthened quiesce and bounded-convergence contract now
has four consecutive passing replays. Cache retention remains variable (3.8 MB in
the first pass and 10.0 MB in the next three), so explicit cache ownership,
diagnostics, cleanup, keep-data, and remove-all behavior remain open.

### Exact packaged and installed real-service evidence

The first exact-server build run
[`29554542783`](https://github.com/ApiaryLens/apiarylens/actions/runs/29554542783)
failed during Squirrel construction. The portable-server deployment tree contained
pnpm junctions, and NuGet rejected access to the first linked package (`fflate`).
This failure is retained as packaging evidence. The workflow was corrected to use a
hoisted physical deployment tree rather than weakening permissions or excluding
runtime files.

Run
[`29554694681`](https://github.com/ApiaryLens/apiarylens/actions/runs/29554694681)
at commit `a384154c5b2d6082c607ac4f7392cb0d37f876b3` then built, packaged,
installed, exercised, and uninstalled that physical tree on two fresh hosted
Windows jobs. The exact setup SHA-256 was
`0B1F3FEB53A1CDE1390C89C2D14DA073654201BBF6BB2A7082ED46FD0B6F644C`.

| Exact real-service check | Packaged result | Clean-installed result |
|---|---:|---:|
| Portable-server tree | 6.82 MiB, 1,415 files | Present inside exact installed artifact |
| Setup / installed footprint | 135.4 MiB setup | 475.9 MiB, 1,496 files |
| External Node / Rust / .NET SDK | Not required by package | All absent from restricted `PATH` |
| Renderer privilege surface | No Node `process` or `require`; `health` only | Same bridge probe passed |
| Renderer-to-main arguments | 0 | 0 |
| Untrusted sender | Rejected | Rejected |
| Real service bind | `127.0.0.1` | `127.0.0.1` |
| Real SQLite / media creation | Passed / passed | Passed / passed |
| Real service exit | 0 | 0 |
| Control token in tested renderer, storage, console, arguments, readiness, or service output | No | No |
| Five renderer-ready launches | 249 ms mean; 250 ms median | Installed three-second smoke passed |
| Uninstall | N/A in build job | Exit 0; host and registration removed in 315 ms |
| Residual updater/cache files | N/A in build job | 3.6 MiB |

The probe imports the production `@apiarylens/server`, contracts, database, and
media packages and uses the real `SqliteStore`, `FilesystemMediaStore`, and Hono
application behind the main-process credential boundary. It proves packaging,
startup, protected health, storage initialization, shutdown, and the narrow bridge
primitive. It does **not** satisfy the full typed API, user/authentication,
organization-isolation, media-content, migration, backup, crash-report redaction,
production-signing, or retail-device acceptance conditions. The artifact is an
unsigned research build and its license files are incomplete; those facts remain
release blockers rather than being hidden by the green workflow.

Follow-on run
[`29555804486`](https://github.com/ApiaryLens/apiarylens/actions/runs/29555804486)
at commit `7088b44d253bda751d5e8625ddd48c5b287b82e3` replaced the
health-only limitation with a production-dependency-only HTTP acceptance module.
The same 50 assertions ran first from the packaged application and then from the
exact setup artifact on a second clean Windows runner. No Vitest, test runner, or
development SDK was bundled into the product server tree.

| Installed-artifact API check | Result |
|---|---:|
| Exact setup SHA-256 | `264D50EA7F295F77AC24DF7907A3D87BCD491823E95A2196B14AB0DE86DC4651` |
| Packaged / installed assertions | 50 / 50; both passed |
| Migration history on first start and restart | `0001`, `0002`, `0003`, `0004` |
| Protected bootstrap and one-owner claim | Passed |
| CSRF and synchronized-write deduplication | Passed |
| Cross-family resource, changes, membership, media, mutation, and export isolation | Passed |
| Opaque-session rotation and one-time recovery | Passed |
| Viewer write, export, and media-delete denial | Passed |
| Private original, thumbnail, export, restart persistence, and synchronized deletion | Passed |
| Real service restart with same SQLite/media directories and reauthentication | Passed |
| External Node / Rust / .NET SDK in clean job | Absent / absent / absent |
| Control token in tested renderer, storage, console, arguments, readiness, or service output | No |
| Uninstall host / registration | Removed / removed in 307 ms |
| Updater/cache residue | 9.6 MiB |

The cross-family records and bytes were seeded through two control-token and
origin-protected endpoints that exist only in the disposable research wrapper; they
are not product routes. The public API then had to conceal reads, changes, media,
members, and exports, reject a foreign mutation, and leave the foreign records and
bytes unchanged. Sanitized evidence contains only booleans, counts, versions,
statuses, and artifact identity; cookies, passwords, recovery codes, bootstrap
codes, organization identifiers, and media identifiers were not emitted.

This closes the packaged and installed current-schema API, authorization, media,
export, and restart-persistence subgate. It does not prove upgrade from every
historical schema, interrupted or failed migration recovery, a production-signed
artifact, complete SBOM/notices, retail Windows profiles, host accessibility, or
the explicit keep-data/remove-all cleanup policy.

Host-failure follow-on run
[`29557057421`](https://github.com/ApiaryLens/apiarylens/actions/runs/29557057421)
at commit `361852b78798fcae7b66bc6b21a0ac7a1ce5988b` repeated the full
50-check matrix and added actual Electron primary-instance, forced-parent-death,
and same-directory recovery checks to both the packaged and clean-installed
artifact. The exact setup SHA-256 was
`7767FAD62F10CD40EB83103C9B94A0D6DE7045D424DE447C6281BE9CA57198CE`.

| Host failure and recovery check | Packaged | Clean installed |
|---|---:|---:|
| Second Electron instance rejected | Passed | Passed |
| Embedded service exited after forced host death | Passed | Passed |
| Abrupt process-tree death left a stale readiness file | Yes | Yes |
| Next host rejected and removed the dead-PID readiness record | Passed | Passed |
| Service restarted in the same SQLite/media directory | Passed | Passed |
| Recovered service replaced readiness with its live PID | Passed | Passed |
| Recovered service shut down cleanly and removed readiness | Passed | Passed |
| Existing API acceptance matrix | 50 / 50 | 50 / 50 |
| Uninstall | Not applicable | Exit 0 |

This is a load-bearing recovery result rather than a claim that forced termination
can run cleanup code. Windows terminated the child process tree before the service
could remove readiness. The next host therefore treated readiness as advisory,
verified that its recorded PID was dead, removed it, restarted against the same
local directory, replaced readiness only after the service was live, and then
removed it during clean shutdown. Forced-write, disk-full, read-only-directory,
sleep/resume, sign-out, Job Object policy, and retail-device matrices remain open.

Retention follow-on run
[`29558629887`](https://github.com/ApiaryLens/apiarylens/actions/runs/29558629887)
at commit `c9cf68b8ca897378aef292b0b6a374b0e53abd53` exercised two
complete uninstall cycles with the same exact setup artifact. The setup SHA-256 was
`D700B1C84EAAB01B8C220CF33D7633611C8AF81E52341FA8C06F2A2DAFEBF1FF`.

| Exact installed retention check | Result |
|---|---:|
| Default uninstall retained protected standalone root | Passed |
| Default uninstall retained hive-data fixture | Passed |
| Same exact artifact reinstalled | Exit 0 |
| Reinstalled host decrypted protected root as same Windows user | Passed |
| Reinstalled host read retained hive data | Passed |
| Explicit remove-all deleted protected root and hive data | Passed |
| Second uninstall | Exit 0 |
| Second uninstall registration / host remains | No / no |
| External Node / Rust / .NET | Absent / absent / absent |
| Existing API, host-recovery, and credential suites | Passed |

This closes the exact installed keep-data, reinstall, protected-state readability,
remove-all, and second-uninstall mechanics subgate. It does not yet prove the final
user-facing choice, warning, confirmation, cancellation, accessibility, or recovery
UX. Updater/cache residue outside product data remains a separately measured cleanup
and policy gate.

Protected-backup follow-on run
[`29558987057`](https://github.com/ApiaryLens/apiarylens/actions/runs/29558987057)
repeated the two-cycle lifecycle, deleted the active standalone root after reinstall,
restored it from the retained DPAPI-protected backup, and decrypted the same
versioned purpose envelope before remove-all. The exact setup SHA-256 was
`083882BBD26DE553CB6EFBB4F3049825B86949682F6475A1E59E7B7AC036EA05`.
All existing API, host-recovery, credential, retention, remove-all, and uninstall
checks remained green.

Actual-storage-fault run
[`29559517037`](https://github.com/ApiaryLens/apiarylens/actions/runs/29559517037)
at commit `61e56db6ac07ee17c2670b177c17f802560101b5` exercised the real
packaged API database from both packaged and clean-installed hosts. The exact setup
SHA-256 was
`BCF557C10600C17BEE651CAF3652394026980DE2B6DBA89E9A02584FC33B73C9`.

| Actual Electron storage-fault check | Packaged | Clean installed |
|---|---:|---:|
| Committed real-database marker written | Passed | Passed |
| Second transaction left open | Exercised | Exercised |
| Embedded service forcibly terminated | Passed | Passed |
| Same data directory restarted | Passed | Passed |
| `PRAGMA integrity_check` after restart | Passed | Passed |
| Committed marker retained | Passed | Passed |
| Interrupted marker rolled back | Passed | Passed |
| Corrupt database rejected before readiness | Passed | Passed |
| Existing 50-check API, credential, retention, restore, and uninstall suites | Passed | Passed |

The fault routes are control-token and origin protected and exist only in the
disposable research wrapper. This closes actual-host forced-write/WAL rollback,
integrity, committed-state retention, and corrupt-startup subgates. Disk-full,
read-only directory, startup timeout/crash-loop policy, sleep/sign-out/shutdown,
and retail-device behavior remain open.

Database-capacity and read-only follow-on run
[`29560309984`](https://github.com/ApiaryLens/apiarylens/actions/runs/29560309984)
at commit `eb128acbbe4c2809a6d179bcf8828dc9a81115e8` repeated the packaged
and clean-installed lifecycle. The exact setup SHA-256 was
`0755D1E87DE681CC0C25AF2ABA79578062DABB90BD5DCBD15B1614E38208B294`.

| Additional storage check | Packaged | Clean installed |
|---|---:|---:|
| SQLite capacity limit rejected a 1 MiB transaction | Passed | Passed |
| Capacity-failed transaction left row count unchanged | Passed | Passed |
| `PRAGMA integrity_check` after capacity failure | Passed | Passed |
| Actual Windows ACL denied writes to the selected directory | Exercised | Exercised |
| Host rejected the ACL-denied directory before readiness | Passed | Passed |
| Existing API, credential, recovery, retention, restore, and uninstall suites | Passed | Passed |

The database-capacity case is a deterministic `SQLITE_FULL` simulation created by
temporarily setting `PRAGMA max_page_count` to the database's current page count; it
is not a claim that a physical Windows volume was filled. The read-only case is an
actual Windows filesystem boundary: the runner applied an explicit deny-write ACE
for the current user to a disposable directory, launched the exact host against it,
confirmed failure before readiness, restored the original security descriptor, and
removed the lab. This closes the deterministic database-full and ACL-denied startup
subgates. A physical-volume-full replay, startup timeout/crash-loop policy,
sleep/resume, sign-out/shutdown, Job Object policy, and retail-device behavior remain
open.

Startup-failure follow-on run
[`29560930136`](https://github.com/ApiaryLens/apiarylens/actions/runs/29560930136)
at commit `40d1f508c94c3601b06422571e180e4bf1c34eab` replayed the exact
packaged and clean-installed forms. The setup SHA-256 was
`DA49B28C6327141D1B2380A06D6851048F20B890E4D95B250E3FBE6FE37C4413`.

| Startup-failure check | Packaged | Clean installed |
|---|---:|---:|
| Delayed child exceeded the research readiness deadline | Exercised | Exercised |
| Host terminated the timed-out child | Passed | Passed |
| Timed-out child never published readiness | Passed | Passed |
| Three pre-readiness crashes consumed the bounded retry budget | Passed | Passed |
| No crashed attempt published readiness or remained running | Passed | Passed |
| Explicit retry recovered the same directory | Passed | Passed |
| Recovery shutdown removed readiness | Passed | Passed |
| Existing 50-check API and lifecycle matrix | Passed | Passed |

The probe deliberately uses a 400 ms research deadline against an injected 3-second
startup delay so it does not pretend to select a production timeout from hosted-runner
timing. It proves that the Electron host can bound readiness, terminate the child,
cap automatic attempts at three, stop without an orphan or false-ready state, and
recover only after an explicit retry. Production timeout/backoff values and final
user-facing recovery messaging remain design/retail gates. Physical-volume-full,
Job Object policy, sleep/resume, sign-out/shutdown, and retail-device behavior also
remain open.

### Exact historical and failed migration evidence

Exact-artifact run
[`29565936418`](https://github.com/ApiaryLens/apiarylens/actions/runs/29565936418)
at commit `26208e7423f22d904e6e5c217409d710a1309226` used setup SHA-256
`569EB1E72EE0CA40E8CB92E5AE2532739A991DA936DF1C4F2B61871C032C718C`.
Both the packaged and clean-installed Electron runtime loaded the real bundled
`@apiarylens/database` migration modules rather than copied SQL.

| Migration check | Packaged | Clean installed |
|---|---:|---:|
| Upgrade from ledger head `0001` to `0004` | Passed | Passed |
| Upgrade from ledger head `0002` to `0004` | Passed | Passed |
| Upgrade from ledger head `0003` to `0004` | Passed | Passed |
| Seeded owner organization preserved | Passed | Passed |
| `0004` bootstrap claim backfilled | Passed | Passed |
| Audit index, exact checksums, and integrity after valid upgrade | Passed | Passed |
| Incompatible `0004` rejected before readiness | Passed | Passed |
| Failed attempt left ledger at `0003` and committed data intact | Passed | Passed |
| Explicit repair followed by retry reached `0004` | Passed | Passed |
| Deliberately wrong recorded `0003` checksum rejected | **Failed** | **Failed** |
| Wrong checksum remained after readiness | **Yes** | **Yes** |

The historical-prefix and failed-migration repair/retry mechanisms now have exact
artifact evidence. The same test exposed a release-blocking defect: `SqliteStore`
executes migration SQL and then uses `INSERT OR IGNORE`, but it does not validate an
existing version's recorded checksum. A modified `0003` ledger entry therefore
reached readiness and remained modified. [WIN-026](https://github.com/ApiaryLens/apiarylens/issues/47)
requires ordered immutable-prefix validation, atomic migration-plus-ledger writes,
unknown/skipped/out-of-order rejection, and exact packaged/installed negative tests.
The migration acceptance condition remains open until that product fix is
authorized, implemented, and proven.

### Electron package-transition evidence

Exact-artifact replay
[`29547059418`](https://github.com/ApiaryLens/apiarylens/actions/runs/29547059418)
used the signed `0.1.0` and `0.1.1` packages built by run `29546655675` and exercised
their transition behavior without rebuilding either artifact.

| Transition check | Result |
|---|---:|
| Truncated `0.1.1` artifact | SHA-256 mismatch; rejected before execution |
| Installed version after rejection | `0.1.0`; unchanged |
| Upgrade | `0.1.0` to `0.1.1`; exit 0 |
| State and signer after upgrade | Retained / exact signer retained |
| Downgrade attempt | `0.1.1` to `0.1.0`; exit 0 |
| State after downgrade | Retained |
| Repair/re-upgrade | `0.1.0` to `0.1.1`; exit 0 |
| Final uninstall | Exit 0; registration absent |
| Synthetic user state after uninstall | Retained |

Squirrel permits a direct downgrade when an older signed setup is executed. That is
mechanism evidence, not approval to expose an unrestricted downgrade path. The
product lifecycle must first verify schema compatibility, quiesce writes, create and
verify a backup, run the package transition, perform health checks, and restore or
roll back only when the manifest declares that path compatible. Retained state also
requires explicit **keep data** and **remove all data** uninstall choices.

## Tauri and packaged Node sidecar baseline

GitHub Actions run
[`29541496537`](https://github.com/ApiaryLens/apiarylens/actions/runs/29541496537)
built the challenger on a fresh `windows-2025-vs2026` hosted runner. The workflow
generated the Tauri lab only under the runner temporary directory; no Tauri product
scaffold entered the repository. It used Tauri CLI 2.11.4, Rust 1.97.0, the same
production React bundle, the Node 24.18.0 executable as a packaged external binary,
and the normal WebView2 Evergreen bootstrapper installer mode.

| Metric | Result |
|---|---:|
| NSIS installer | 24.3 MiB |
| Loose release files | 102.9 MiB, 7 files |
| Tauri host executable | 8.4 MiB |
| Packaged Node sidecar | 88.2 MiB |
| Packaged-sidecar `node:sqlite` probe | Passed |
| WebView process-ready proxy, runs | 903, 172, 171, 168, 151 ms |
| Proxy mean / median | 313 / 171 ms |
| Peak process count | 8–9 |
| Mean peak combined working set | 310.9 MiB |
| Mean peak combined private memory | 122.7 MiB |

The startup value is time to detection of a descendant WebView2 process, not DOM
ready, so it cannot be compared directly with Electron's renderer-ready event. The
memory measurements were also taken on a different Windows host and include the
shared WebView2 process tree attributable to the application. This build-step
measurement did not install the artifact; the separate lifecycle replay below did.

Lifecycle run
[`29542529439`](https://github.com/ApiaryLens/apiarylens/actions/runs/29542529439)
downloaded the exact artifact produced by run `29541868968` into a second fresh
Windows runner. Before launching the installer it restricted `PATH` to Windows
system directories and confirmed that external Node, Rust, and .NET executables were
unavailable.

| Clean-profile lifecycle check | Result |
|---|---:|
| Artifact SHA-256 verification | Passed |
| Silent current-user install | Exit 0 |
| Installed footprint | 96.7 MiB, 3 files |
| Installed Tauri host | 8.4 MiB |
| Installed packaged Node sidecar | 88.2 MiB |
| Installed-sidecar `node:sqlite` probe | Passed |
| Three-second installed-host smoke | Passed; WebView2 descendant observed |
| Smoke process count / working set / private memory | 8 / 305.5 MiB / 112.4 MiB |
| Silent uninstall | Exit 0 |
| Install directory after uninstall | Absent |
| Uninstall registration after uninstall | Absent |

This is stronger than a build-only prerequisite claim: the released shape installed,
ran its packaged runtime, and uninstalled without finding a developer runtime on
`PATH`. It remains a hosted Windows Server runner with WebView2 already installed,
not a retail Windows image or physical family computer, and the artifact is unsigned.

The result establishes a material footprint difference: the Tauri installer is 18%
of the equivalent Electron Squirrel installer, and its installed footprint is 21%
of Electron's pre-uninstall footprint. That advantage depends on the separately
serviced shared WebView2 runtime. An offline Tauri package that embeds the current
WebView2 installer would add roughly the amount documented by Tauri and must be
measured separately.

### Tauri test-signing evidence

Targeted run
[`29545675051`](https://github.com/ApiaryLens/apiarylens/actions/runs/29545675051)
created a runner-only 3072-bit RSA code-signing identity, built the Tauri challenger,
verified the exact final NSIS installer signer, and then installed, launched, and
uninstalled that same artifact. The private key and certificate were not uploaded
and were destroyed with the hosted runner.

| Signing and lifecycle check | Result |
|---|---:|
| Final NSIS installer | 24.3 MiB; exact ephemeral signer present |
| Packaged Node sidecar | 88.2 MiB; `node:sqlite` passed |
| Five WebView process-ready proxy launches | Passed; mean 353.8 ms / median 157 ms |
| Exact signed installer install | Exit 0 |
| Installed footprint | 96.7 MiB, 3 files |
| Installed Tauri host | 8.4 MiB; exact installer signer retained |
| Installed-sidecar `node:sqlite` / three-second host smoke | Passed / passed |
| Smoke process count / working set / private memory | 8 / 313.2 MiB / 118.0 MiB |
| Exact signed installer uninstall | Exit 0; install directory and registration absent |

Tauri's loose `target/release` host was deliberately recorded as `NotSigned`. It is
an intermediate build output, not the distributed release shape. Tauri signs the
copy placed into the final NSIS bundle; the exact installed host retained the same
certificate thumbprint as the final installer. Release verification must therefore
inspect the final installer and the installed executable, not mistake the loose
intermediate for the shipped binary.

Windows reported `UnknownError` for trust status because the self-signed root was
deliberately not added to the runner's trusted-root store. As with the Electron
candidate, this proves Authenticode embedding and signer continuity, not publisher
reputation, trusted timestamping, or the production certificate chain. The runner
already had WebView2 and was a hosted Windows Server profile, so missing-runtime and
retail Windows behavior remain open gates.

### Tauri offline WebView2 remediation artifact

Targeted run
[`29548294126`](https://github.com/ApiaryLens/apiarylens/actions/runs/29548294126)
built the same Tauri/Node challenger with Tauri's `offlineInstaller` WebView2 mode.
It verified the exact test-signed NSIS artifact, installed it under a restricted
`PATH`, launched the installed host and sidecar, observed a WebView2 descendant, and
removed the installation and registration.

| Offline-remediation artifact check | Result |
|---|---:|
| Offline NSIS installer | 221.1 MiB; SHA-256 recorded; exact ephemeral signer present |
| Bootstrapper NSIS comparison | 24.3 MiB |
| Offline package increase | 196.7 MiB |
| Installed footprint | 96.7 MiB, 3 files |
| Installed packaged Node sidecar | 88.2 MiB; `node:sqlite` passed |
| Installed host smoke | Passed; WebView2 descendant observed |
| Uninstall | Exit 0; install directory and registration absent |
| Installed license/notice files | None |

The larger WebView2 installer is acquisition/remediation payload, not an additional
per-application installed runtime when a compatible Evergreen runtime already
exists. This run therefore proves that ApiaryLens can build, sign, install, run, and
uninstall the offline package shape; it does **not** prove first-run remediation on
a machine where WebView2 is missing or its updater is policy-disabled.

The proposed distribution policy is a small bootstrapper package for the normal
online channel plus a separately identified offline-remediation package for offline
or managed environments. Scout and the Windows download page must select or explain
the correct artifact without asking a family user to diagnose WebView2. Final
acceptance still requires a retail Windows profile with the runtime genuinely
absent, a policy-disabled update profile, redistributable-license/notice closure,
and a test that the installed Evergreen runtime subsequently receives security
updates. Fixed Version remains rejected as the default because it would transfer
the browser patching SLA to ApiaryLens.

### Tauri package-transition evidence

Exact-artifact replay
[`29547216046`](https://github.com/ApiaryLens/apiarylens/actions/runs/29547216046)
used the signed `0.1.0` and `0.1.1` NSIS packages built by run `29546655675` and
exercised the same transition sequence as the Electron candidate.

| Transition check | Result |
|---|---:|
| Truncated `0.1.1` artifact | SHA-256 mismatch; rejected before execution |
| Installed version after rejection | `0.1.0`; unchanged |
| Upgrade | `0.1.0` to `0.1.1`; exit 0 |
| State and signer after upgrade | Retained / exact signer retained |
| Downgrade attempt | `0.1.1` to `0.1.0`; exit 0 |
| State after downgrade | Retained |
| Repair/re-upgrade | `0.1.0` to `0.1.1`; exit 0 |
| Final uninstall | Exit 0; registration absent |
| Synthetic user state after uninstall | Retained |

NSIS also permits a direct signed downgrade. The same product-controlled gates are
therefore mandatory for either finalist; package-manager success alone does not make
a schema or data downgrade safe. These tests cover artifact acquisition rejection
and package transitions. The following independent SQLite probe covers the recovery
algorithm; integrated released-product and power-loss tests remain open.

## SQLite migration and recovery evidence

Windows run
[`29547423940`](https://github.com/ApiaryLens/apiarylens/actions/runs/29547423940)
used Node 24.18.0 `node:sqlite` on a clean hosted runner to exercise the data half of
the update transaction independently of either package host.

| Recovery check | Result |
|---|---:|
| Kill process with an uncommitted write transaction | Uncommitted row absent; committed hive retained; integrity passed |
| Checkpointed schema-1 backup | Hash recorded; contents and integrity verified |
| Truncated backup | Hash mismatch; rejected before restore |
| Transactional schema 1→2 migration | Inspection preserved; integrity and health passed |
| Schema-2 database with candidate maximum schema 1 | Downgrade rejected before package transition |
| Injected migration failure | Transaction rolled back; schema remained 2; partial table absent |
| Injected post-migration health failure | Verified schema-1 backup restored; original hive retained |
| Evidence secret scan contract | No credentials or secret values generated |

This closes the research proof for transactional migration failure and verified
SQLite restore. It does not replace integrated testing with the released ApiaryLens
migrations, media snapshot, pending PWA/desktop work, and selected package host.
Process termination also does not prove whole-machine power-loss behavior during a
filesystem flush; that remains a physical/VM fault-injection acceptance case.

## SBOM, license, and provenance evidence

Exact-artifact run
[`29547645058`](https://github.com/ApiaryLens/apiarylens/actions/runs/29547645058)
replayed both signed installer lifecycles and generated CycloneDX JSON from each
installed runtime plus its retained lock/build inputs. It used
[Syft 1.48.0](https://github.com/anchore/syft/releases/tag/v1.48.0), downloaded from
the official release and accepted only after its archive matched SHA-256
`B46CB02A47C5B76A1656958757D62AC07D0CB7DE35F92E8A7E02D450CBB53097`.
Syft is a disposable research tool, not an ApiaryLens runtime dependency.

| Provenance check | Electron | Tauri + Node sidecar |
|---|---:|---:|
| Source signed-artifact run | `29545351946` | `29545675051` |
| Installed-runtime CycloneDX components | 12 | 3 |
| Lock/build-input CycloneDX components | 5 | 431 |
| Installed license/notice files | `LICENSE` | None |
| Runtime components with inferred license metadata | 0 of 12 | 0 of 3 |
| Runtime SBOM SHA-256 recorded | Yes | Yes |
| Build-input SBOM SHA-256 recorded | Yes | Yes |

The generated SBOMs prove repeatable catalog and provenance plumbing, but they do
**not** close distribution review. Binary inspection identifies Electron/Chromium,
Squirrel, graphics, Tauri-host, and Node components without reliably inferring their
licenses. The Tauri lock inventory also lacks license expressions because Cargo lock
files do not carry that metadata. Most importantly, the Tauri package installed no
third-party notice file, and Electron installed only one general license file.

Electron follow-up run
[`29565064135`](https://github.com/ApiaryLens/apiarylens/actions/runs/29565064135)
replaced that incomplete Electron result with release-failing reconciliation in the
exact Squirrel artifact. The build first packaged and probed Electron 43.1.1,
Chromium 150.0.7871.114, and Node 24.18.0, generated deterministic CycloneDX files,
injected them and the notice bundle into the already-probed package, and invoked
Forge `make --skip-package`. Setup SHA-256 was
`A40D49122EDBEBC084955C8780687FB3CE24578E85924CE28C0DEE6CB6289CB2`.

| Exact Electron reconciliation | Result |
|---|---:|
| npm build components with declared licenses | 414 of 414 |
| npm build components with registry integrity | 414 of 414 |
| Exotic Git dependency references | 0 |
| Top-level runtime components with notice mapping | 13 of 13 |
| Installed hashed license/notice files | 9 |
| Installed runtime CycloneDX SHA-256 | `ABC148A174A2650DDAC80119B626779D3FD8736594B29E423A5BC0961790BB74` |
| Installed build-input CycloneDX SHA-256 | `FAF04089AD219CFD04E25D7FD89AE115A067EA38B612DCD5AA04FB677F7BA3BA` |
| Independent clean-install reconciliation | Passed |

The installed bundle now carries ApiaryLens Apache-2.0 `LICENSE` and `NOTICE`,
Electron's license, Electron's complete Chromium third-party notice document, the
Squirrel.Windows license, and the four external server-library licenses. The
clean-install job independently matched every notice hash and every SBOM count
before completing the existing API/security/credential and uninstall/reinstall
lifecycle. This closes the automated top-level Electron notice and manifest gap.
It does not replace final counsel/maintainer review of installer-vendor binaries,
nor signed provenance and production Authenticode evidence.

Before either candidate can be selected for release, the remaining applicable work
is:

1. Produce a Rust-aware and npm-aware license inventory from resolved, verified
   manifests rather than treating missing CycloneDX license fields as acceptable.
2. Reconcile runtime binaries, sidecars, web assets, installer engines, and build
   inputs to the release manifest and SBOM.
3. Generate and install the complete Apache-2.0 notice plus every required
   third-party license/notice, including Node, WebView2 redistribution where
   applicable, Electron/Chromium or Tauri/Rust dependencies, and installer tooling.
4. Fail the release when a component is unlicensed, has a prohibited license, lacks
   provenance, or is absent from the notice/SBOM reconciliation.
5. Sign and attest the SBOM and notice bundle with the immutable release artifacts.

## Shared UI accessibility evidence

The first Windows accessibility run
[`29547961728`](https://github.com/ApiaryLens/apiarylens/actions/runs/29547961728)
found one shared-product defect: the **Use a recovery code** button was only 28.2 CSS
pixels high at every tested profile. Commit `23dac44` restored a 44-pixel minimum
target, and rerun
[`29548097125`](https://github.com/ApiaryLens/apiarylens/actions/runs/29548097125)
passed the automated gate against the rebuilt React bundle.

| Shared UI accessibility check | Result |
|---|---:|
| axe-core 4.12.1 WCAG A/AA violations across five profiles | 0 |
| Keyboard sequence and visible focus | Passed |
| Main landmark / single page heading | Passed / passed |
| Targets below 44 CSS pixels | 0 |
| Horizontal overflow at desktop, 200%, and 400% reflow equivalents | None |
| Forced-colors media activation | Passed |
| Reduced-motion media activation | Passed |

The 640- and 320-CSS-pixel profiles are standards-aligned reflow equivalents for
200% and 400% zoom; they are not proof of each desktop host's native zoom controls.
Headless Chromium also cannot replace NVDA, retail Windows High Contrast, physical
keyboard use, Electron/WebView2 host chrome, file dialogs, update prompts, or native
error surfaces. Those remain manual host-specific acceptance gates.

## Security and lifecycle requirements common to finalists

Regardless of framework:

1. Ship only local application assets; never load the privileged desktop window from
   an arbitrary remote URL.
2. Keep the web renderer unprivileged. Expose a versioned, allowlisted desktop API
   and validate origin, sender, schema, organization scope, and file/process targets.
3. Bind any local HTTP service to loopback on an operating-system-assigned port and
   authenticate every request with an ephemeral, process-scoped secret. Prefer a
   private pipe where framework support and web-client reuse permit it.
4. Store long-lived credentials in Windows credential protection, not localStorage,
   IndexedDB, command lines, plans, logs, crash reports, or exported diagnostics.
5. Supervise the local service as a child of the signed application; prevent orphan
   processes, duplicate writers, uncontrolled firewall rules, and unsafe shutdown.
6. Quiesce writes and create a verified backup before update. Update UI, service,
   schema compatibility metadata, and migration assets atomically; health-check
   before committing; restore or roll back when compatible.
7. Verify product manifest identity, artifact size, SHA-256, signing chain,
   attestation, channel, schema range, and rollback compatibility before execution.
8. Preserve unsynchronized work and media across application, WebView, and operating
   system updates.

## Evidence-weighted decision matrix

Scores use `1` (poor) through `5` (strong) and now reflect the measured lifecycle,
signing, transition, recovery, SBOM, and shared-UI evidence above. The matrix is a
research recommendation, not the host/package ADR.

| Criterion | Weight | Electron | Tauri + Node sidecar | Custom WebView2 + sidecar | Native WinUI |
|---|---:|---:|---:|---:|---:|
| Existing React/domain reuse | 15 | 5 | 4 | 4 | 2 |
| Existing Node/SQLite reuse | 15 | 5 | 3 | 3 | 2 |
| Family installation simplicity | 15 | 4 | 4 | 3 | 3 |
| Security boundary/hardening clarity | 15 | 3 | 4 | 2 | 4 |
| Measured package/runtime footprint | 10 | 2 | 5 | 4 | 3 |
| Update/rollback integration | 10 | 4 | 4 | 2 | 3 |
| Accessibility evidence path | 10 | 4 | 4 | 3 | 5 |
| Supply chain, license, notice, and provenance | 5 | 3 | 2 | 3 | 4 |
| Maintainer/build complexity | 5 | 5 | 3 | 1 | 2 |
| Weighted score out of 500 | 100 | **395** | **380** | 290 | 305 |

Electron rises to `3` for supply-chain closure because the exact package now has
registry-integrity and declared-license coverage for all 414 npm build entries,
zero exotic Git references, and installed hashed notice coverage for all 13
top-level runtime components. Signed/attested provenance and final installer-vendor
binary review remain open. Tauri stays at `2` with a materially larger Rust/npm
build graph, incomplete installed notices, and an unproven exact-product Node
application sidecar. Neither can ship from research evidence alone.

## Evidence-based recommendation for the ADR

Select **Electron as the initial Windows Preview host**, conditional on the remaining
host-bridge, package, license, and retail-profile gates. Retain **Tauri 2 plus a
packaged Node sidecar** as the measured revisit candidate rather than building two
product clients.

The recommendation is based on delivery risk, not framework preference:

- Electron directly carries the required Node 24 runtime and `node:sqlite`, reuses
  the current React application, and avoids making WebView2 acquisition or servicing
  part of the normal installation path.
- The exact Electron research artifact already installed, launched, exercised
  the real portable service's protected health/storage startup plus `node:sqlite`,
  upgraded, downgraded, repaired, and uninstalled without external Node, Rust,
  .NET, WSL, or Linux tooling.
- Tauri's 24.3 MiB online installer and 96.7 MiB installed footprint are compelling,
  but the current probe packages only the Node executable. It has not yet packaged
  and supervised the exact ApiaryLens server application and dependency graph.
- Electron's larger 133.8 MiB installer and approximately 467 MiB installed
  footprint are an accepted Preview trade-off only if complete removal, patch
  cadence, and family-device performance pass exact-artifact UAT.
- A sandboxed renderer, context isolation, narrow sender-validated preload bridge,
  and host-owned service/credential access are mandatory. A bridge that exposes raw
  tokens or general filesystem/process access overturns the recommendation.
- Squirrel is the measured package mechanism, not yet the selected release package.
  The exotic Git dependency is removed by an exact registry override and a
  release-failing lock assertion. Exact top-level runtime/build SBOM and hashed
  notice reconciliation now passes. Residual cache policy, final installer-vendor
  binary review, signed provenance, production signing, and retail evidence remain
  before ADR acceptance.
- Do not introduce a native Windows Job Object binding or bootstrap launcher solely
  for child cleanup in the initial Preview. The exact packaged and installed host
  already proves non-detached parent polling, forced-parent-death convergence,
  dead-PID readiness recovery, bounded startup failure, and explicit retry. Reopen
  if retail lifecycle testing reproduces an orphan or the package stack provides a
  maintained signed containment primitive without a new runtime.

Reject a native WinUI rewrite for the first Windows client. Keep a custom WebView2
host only as a control; reimplementing IPC, security policy, packaging, updating,
and supervision provides no family-user benefit while a finalist remains viable.

Revisit Tauri when an exact ApiaryLens server sidecar, host bridge, WebView2
remediation, notices, and update/rollback lifecycle all pass with lower operational
risk than the selected Electron release. Do not maintain Electron and Tauri product
implementations in parallel.

## Remaining experiments and exit gate

`WIN-003` closes only after the following evidence is attached here:

1. Measure signed or test-signed installer download size, installed size, cold/warm
   launch, idle/active memory, process count, first-run runtime remediation, and
   complete uninstall for Electron and Tauri.
2. Exercise local-service startup, crash, restart, duplicate-instance prevention,
   clean shutdown, data lock, and orphan cleanup. Packaged and clean-installed
   single-instance, forced-parent-death, stale-readiness recovery, restart
   persistence, clean shutdown, forced-write/WAL recovery, deterministic
   `SQLITE_FULL`, ACL-denied startup, bounded readiness timeout, three-attempt crash
   budget, and explicit-retry recovery now pass. Production timeout/backoff values,
   recovery UX, physical-volume-full behavior, Job Object policy, and the broader
   Windows lifecycle matrix remain open in the actual host. Exact packaged and
   installed run `29571215352` additionally proves two trusted windows share one
   service PID, an untrusted window remains rejected, IPv6 loopback cannot reach the
   explicit IPv4 listener, and black-hole environment proxy variables do not divert
   the host-owned local request. Clean-install replay `29571914796` additionally
   proves the same bridge under an enabled black-hole Windows per-user proxy policy,
   restores the prior registry state, and finds no installer-created Windows Firewall
   application rule for the installed host.
3. Verify Windows 11 and the chosen Windows 10 baseline in clean user profiles with
   no developer tools. Include a profile where WebView2 is absent or its updater is
   policy-disabled.
4. Run keyboard, high contrast, 200%/400% zoom, reduced motion, and NVDA smoke tests
   on both candidates. Record failures by shared UI versus host integration.
5. Produce SBOM/license/provenance output and compare signing, update, downgrade,
   interrupted-update, health-failure, and rollback behavior.
6. Draft the Windows host/package ADR for `WIN-008` from the completed evidence-
   weighted matrix and conditional Electron recommendation. The ADR cannot be
   accepted until the host bridge, package mechanism, and distribution review either
   satisfy the stated conditions or overturn the recommendation.

The resulting ADR must state the selected host, package formats, runtime acquisition
policy, update mechanism, support baseline, signing/trust model, and conditions that
would cause the choice to be revisited.

## Gallery or registry impact

No community gallery or registry is required for the Windows host itself. Release
artifacts and compatibility metadata belong in immutable GitHub Releases and Scout's
verified product-release discovery contract. Future extensions or templates require
their own gallery/registry decision and cannot load privileged native code by
default.

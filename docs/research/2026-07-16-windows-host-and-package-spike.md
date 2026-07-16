# Windows Host and Package Research Spike

## Status

`WIN-003` is in progress. The owner authorized research and follow-on ADR work on
2026-07-16. This record does not select a framework or authorize product code.

Official-source review and the first Electron measurement baseline are complete.
Equivalent Tauri/WebView2 and clean-profile measurements remain required before the
spike can close.

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

## Weighted decision matrix

Scores are preliminary (`1` poor, `5` strong) and identify what measurements must
challenge. They are not an ADR decision.

| Criterion | Weight | Electron | Tauri + Node sidecar | Custom WebView2 + sidecar | Native WinUI |
|---|---:|---:|---:|---:|---:|
| Existing React/domain reuse | 20 | 5 | 4 | 4 | 2 |
| Existing Node/SQLite reuse | 15 | 5 | 3 | 3 | 2 |
| Family installation simplicity | 15 | 4 | 4 | 3 | 3 |
| Security boundary/hardening clarity | 15 | 3 | 4 | 2 | 4 |
| Package/runtime footprint | 10 | 2 | 4 | 4 | 3 |
| Update/rollback integration | 10 | 4 | 4 | 2 | 3 |
| Accessibility evidence path | 10 | 4 | 4 | 3 | 5 |
| Maintainer/build complexity | 5 | 5 | 3 | 1 | 2 |
| Weighted score out of 500 | 100 | 405 | 380 | 290 | 300 |

Electron currently leads on delivery and backend reuse, while Tauri is the required
challenger for footprint and capability-scoped IPC. The small preliminary score gap
is not sufficient to decide without equivalent measurements.

## Preliminary recommendation

Advance **Electron** and **Tauri 2 plus a packaged Node sidecar** to equivalent
prototype and clean-profile testing.

- Use Electron as the delivery-risk baseline because it directly hosts React and
  Node, minimizes backend repackaging uncertainty, and already produced a working
  host measurement without adding a machine-level SDK.
- Use Tauri as the footprint/security challenger because it reuses Evergreen
  WebView2 and provides capability-scoped IPC and signed updater artifacts.
- Do not select a native WinUI rewrite for the first Windows client.
- Do not build a custom WebView2 framework unless the finalist tests demonstrate a
  concrete requirement that Electron and Tauri cannot meet. Reimplementing IPC,
  security policy, packaging, updater behavior, and lifecycle supervision is not a
  family-user benefit by itself.
- Default WebView2-based candidates to Evergreen with installer detection and
  remediation. Evaluate a separate offline installer artifact; do not make Fixed
  Version the normal channel without a documented compatibility need and an owned
  browser-patching SLA.

## Remaining experiments and exit gate

`WIN-003` closes only after the following evidence is attached here:

1. Build an equivalent Tauri 2 prototype in an isolated Windows CI job or disposable
   research environment, with the current React build and a packaged Node 24
   `node:sqlite` sidecar. Do not install Rust on the maintainer workstation merely
   to satisfy the spike.
2. Measure signed or test-signed installer download size, installed size, cold/warm
   launch, idle/active memory, process count, first-run runtime remediation, and
   complete uninstall for Electron and Tauri.
3. Exercise local-service startup, crash, restart, duplicate-instance prevention,
   clean shutdown, data lock, and orphan cleanup.
4. Verify Windows 11 and the chosen Windows 10 baseline in clean user profiles with
   no developer tools. Include a profile where WebView2 is absent or its updater is
   policy-disabled.
5. Run keyboard, high contrast, 200%/400% zoom, reduced motion, and NVDA smoke tests
   on both candidates. Record failures by shared UI versus host integration.
6. Produce SBOM/license/provenance output and compare signing, update, downgrade,
   interrupted-update, health-failure, and rollback behavior.
7. Replace preliminary matrix scores with evidence, record rejected alternatives,
   and propose the Windows host/package ADR for `WIN-008`.

The resulting ADR must state the selected host, package formats, runtime acquisition
policy, update mechanism, support baseline, signing/trust model, and conditions that
would cause the choice to be revisited.

## Gallery or registry impact

No community gallery or registry is required for the Windows host itself. Release
artifacts and compatibility metadata belong in immutable GitHub Releases and Scout's
verified product-release discovery contract. Future extensions or templates require
their own gallery/registry decision and cannot load privileged native code by
default.

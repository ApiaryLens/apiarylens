# Windows Host and Package Research Spike

## Status

`WIN-003` is in progress. The owner authorized research and follow-on ADR work on
2026-07-16. This record does not select a framework or authorize product code.

Official-source review plus comparable Electron and Tauri/WebView2 packaging,
test-signing, and exact-artifact clean-install lifecycle baselines are complete.
Accessibility, signed update and rollback behavior, retail Windows profile evidence,
and the final license/provenance comparison remain required before the spike can
close. Authenticated local-service supervision is being validated separately under
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

The equivalent installer run
[`29542856476`](https://github.com/ApiaryLens/apiarylens/actions/runs/29542856476)
used Electron Forge 7.11.2 with Squirrel.Windows and retained its generated npm lock
file in the disposable runner lab. Forge currently reaches `@electron/node-gyp`
through a Git dependency; the repository's pnpm supply-chain policy correctly
rejected that exotic transitive dependency. The research workflow did not weaken
the product repository policy. This packaging dependency and its provenance must be
resolved or explicitly accepted before Electron can be selected.

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
| Weighted score out of 500 | 100 | 405 | 390 | 290 | 300 |

Electron currently leads on delivery and direct backend reuse, while Tauri's measured
package footprint and capability-scoped IPC narrow the gap. The preliminary score
difference is not sufficient to decide without lifecycle, accessibility, and
authenticated-sidecar evidence.

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

1. Measure signed or test-signed installer download size, installed size, cold/warm
   launch, idle/active memory, process count, first-run runtime remediation, and
   complete uninstall for Electron and Tauri.
2. Exercise local-service startup, crash, restart, duplicate-instance prevention,
   clean shutdown, data lock, and orphan cleanup.
3. Verify Windows 11 and the chosen Windows 10 baseline in clean user profiles with
   no developer tools. Include a profile where WebView2 is absent or its updater is
   policy-disabled.
4. Run keyboard, high contrast, 200%/400% zoom, reduced motion, and NVDA smoke tests
   on both candidates. Record failures by shared UI versus host integration.
5. Produce SBOM/license/provenance output and compare signing, update, downgrade,
   interrupted-update, health-failure, and rollback behavior.
6. Replace preliminary matrix scores with evidence, record rejected alternatives,
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

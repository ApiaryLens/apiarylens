# Installation and Deployment Experience

## Status

Current MVP architecture. ADRs 0008 through 0011 select the application, storage,
identity, synchronization, and Scout Bee design. Profile measurements, packaging,
network/TLS proof, and deployment UAT remain release gates.

## MVP User

The MVP go-to-market user is a family or hobbyist beekeeper: for example, a parent
and child beginning to manage a small number of hives. They should not need to
understand containers, databases, DNS, TLS, identity providers, or cloud billing to
get value from ApiaryLens.

The long-term family outcome is one synchronized record available through an
installed PWA on iPhones, iPads, laptops, and desktop computers at zero or
predictably near-zero recurring cost. Device-local and self-hosted modes remain
first-class, but a family should not have to keep a laptop awake merely to use the
product across devices.

The target first-run experience is:

1. Open ApiaryLens or download a trusted installer.
2. Choose personal use or family/shared use.
3. Enter only basic beekeeper, apiary, and hive information.
4. Start recording hive information.
5. Receive clear backup, update, and synchronization guidance.

## Required Experience

- A personal user can begin without a cloud account or command line.
- A device-only user may omit a password only while ApiaryLens remains unreachable
  from every other device.
- A family can use the same synchronized record across authorized phones, tablets,
  and computers through a supported always-available profile.
- Installation does not require choosing a database, queue, object store, or identity provider.
- Updates are guided, preserve data, and create or verify a backup first.
- The current product, API, schema, synchronization, and deployment versions are
  visible and traceable to the exact release notes and artifacts.
- Backup, restore, export, diagnostics, and uninstall are first-class workflows.
- The interface explains whether data is device-local, synchronized, or pending.
- Advanced options are available without being presented during the default path.
- Every profile uses the same core product, contracts, and data formats.
- No profile requires AI, telemetry, or a paid external service.

## Capability Tiers

Tiers change operational footprint and enabled capabilities, not product ownership
or data portability.

| Tier | Intended user | Footprint | Identity and access | Direction |
|---|---|---|---|---|
| Personal | Individual or hobbyist | Device-local PWA or loopback-only service, no required server | Password optional only while device-only; organization model remains hidden internally | Post-MVP P1 research priority |
| Family | Family or small apiary | Small always-available sync service on a home server, VM, or near-free cloud profile | Mandatory built-in accounts, multiple identities, and sharing | Primary outcome after sync and cost research |
| Organization | Club, commercial operation, extension office, or research team | Always-on server with scalable database, media, and worker options | Mandatory authentication, full membership, roles, audit, optional OIDC | Later roadmap |

The data model should include organization and membership concepts from the start so
moving between tiers does not require data conversion or a different edition.

## Post-MVP Proposed Device-Only Personal Mode

The easiest path may be an installable PWA that stores data locally on the device
and does not require a backend account. A user could later connect that installation
to a self-hosted or managed synchronization service.

This direction requires a research spike covering browser storage durability,
persistent-storage APIs, media capacity, backup/export, device loss, schema upgrades,
cross-browser behavior, and migration from local-only identity to shared identity.
Browser storage must not be treated as the only durable copy without an explicit
backup experience.

## Family and Server Mode

Family sharing and access from multiple devices require an available synchronization
server. The server may run on a local device, an always-on home system, a generic
cloud VM, or a future managed ApiaryLens service.

The PWA must continue working offline when that server is asleep or unreachable.
The design must clearly explain that a laptop-hosted server cannot synchronize other
devices while the laptop is off.

Local-network access requires research into HTTPS, trusted certificates, service
workers, local DNS or mDNS, firewall configuration, and secure optional remote
access. A third-party tunnel cannot be required for core operation.

LAN access is networked access and requires authentication and encrypted transport
even when the server is inside a home. Public cloud and internet-facing access
require normal publicly trusted HTTPS. The default family path uses built-in
ApiaryLens accounts so a beekeeper does not need to configure a separate identity
provider.

## Scout Bee Bootstrapper

`Scout Bee` is the working name for the completed MVP guided ApiaryLens deployment
planner and bootstrapper. It is not a separate edition of the product. Its MVP
target adapters and acceptance boundary are defined in the
[MVP Definition and UAT Contract](../product/mvp-definition.md).

Accepted MVP responsibilities:

- Ask a small set of plain-language questions
- Ask whether ApiaryLens will be used only on this device, by other devices on a
  private network, or remotely over the internet
- Recommend a deployment profile
- Run preflight checks
- Install or update the selected local/server profile
- Configure storage, ports, backups, and optional remote access
- Display recovery and diagnostic information
- Produce a secret-free, versioned `apiarylens-deployment.json` plan
- Allow an advanced user or automation system to apply the exported plan elsewhere
- Support dry-run, resume, rollback, and safe re-entry
- Generate strong secrets and refuse no-auth/non-loopback, default-credential, or
  public-HTTP combinations

Scout Bee uses an embedded React interface and a Go loopback executor. Packaging,
signing, and cross-platform builds follow ADR 0011; the plan schema and target
adapters are verified during implementation.
Scout Bee must consume the same versioned deployment schema used by automation; it
must not hide an unrelated deployment implementation behind its UI.

Scout Bee also owns the guided MVP update journey for its supported targets:
discover an explicit release, show impact and compatibility, preflight, verify a
backup, stage exact artifacts, run migrations, activate, verify health, and either
commit or recover. Direct operator procedures remain supported so the bootstrapper
does not become a product lock-in. See
[Versioning, Release, and Update Lifecycle](versioning-release-and-update-lifecycle.md).

The initial plain-language choice order is:

1. Family Cloud - Cloudflare
2. My Own Hardware - Docker Compose
3. Cloud Virtual Machine - Docker Compose
4. Only This Device
5. Advanced deployment-plan export

Usability research may refine the labels, but it must preserve the accepted
deployment priority and clearly explain availability, ownership, cost, security,
and portability consequences.

## Deployment Experiences

| Experience | Purpose | Timing |
|---|---|---|
| Public demo at `apiarylens.app` | Cloudflare-hosted PWA frontend connected to safe, resettable demo services | Early |
| Installable device-only personal PWA | Begin without operating a server | Post-MVP P1 research |
| Scout Bee guided deployment | Complete MVP deployment experience for the Hyper-V Compose UAT VM and Cloudflare, with Azure Compose conditional for the first checkpoint | MVP required |
| Docker Compose on personally controlled hardware | Complete local server on a laptop, mini-PC, home server, supported NAS, or local VM | First self-hosted server target |
| Cloudflare-native family cloud | Always-available synchronization for phones, tablets, and computers with published cost and quota limits | First cloud target, gated by Task 006 |
| Docker Compose on a cloud VM | Portable always-on cloud deployment without backend platform lock-in | Second cloud target and fallback |
| Azure, AWS, GCP, or other one-click templates | Convenience wrappers over the same artifacts | Later, per provider |
| Managed ApiaryLens service | Lowest-operations shared experience | Future optional SaaS |

## Cloud and Free-Tier Policy

The Cloudflare-native family profile is the first cloud implementation target, but
the product must not promise permanent free hosting. Free programs, limits,
supported services, account requirements, and billing behavior change.

The core server should publish portable OCI images and a Compose deployment that can
run on a local machine or ordinary VM. Provider templates may wrap those artifacts
later without changing product behavior.

Cloudflare is the accepted host for the official public frontends. A
Cloudflare-native backend uses a different runtime and database architecture from a
conventional Node API plus SQLite, so it is the first cloud profile to research and
validate rather than a replacement for the portable core. Shared contracts,
conformance tests, export, and migration prevent the profiles from becoming separate
products.

See [Cloud Free-Tier Deployment Spike](../research/cloud-free-tier-deployment-spike.md).

## Apple Device and Native Roadmap

The PWA is the first client for iPhone and iPad. It must be tested on real supported
Apple devices for installation, offline launch, updates, media capture,
synchronization, storage behavior, and recovery.

An iPhone App Store release is a committed later roadmap track. Research and an ADR
will choose Capacitor, another wrapper, or native implementation. The downloadable
client must connect to the user's chosen compatible ApiaryLens deployment and reuse
the public authentication, API, synchronization, media, and portability contracts
rather than creating a separate Apple-only product or backend.

The connection experience should support guided setup for self-hosted, family-cloud,
and future managed deployments. Server discovery, QR or connection-file onboarding,
TLS trust, credential handling, and safe reconnection require dedicated security and
usability design.

## Remaining Release Acceptance

- Provider-hosted AWS and GCP Ubuntu Compose compatibility evidence
- Physical iPhone and iPad installation, offline relaunch, media capture,
  synchronization, conflict, and recovery evidence
- Separate-device beekeeper/viewer invitation and shared-history journey
- Pending inspection and photos preserved across a released PWA/server update
- Manual NVDA, VoiceOver, 200% zoom, and forced-colors acceptance
- Final project-owner acceptance and unchanged-candidate stable promotion

Device-only storage and account migration, optional OIDC, native App Store clients,
provider-specific one-click templates, and expanded organization discovery remain
post-MVP roadmap work rather than hidden release requirements.

# Deployment Strategy

## Objective

ApiaryLens must be easy for a family or hobbyist to start while remaining portable,
self-hosted, and scalable. Deployment tiers use the same core product and data
formats; they are not separate editions.

The primary family outcome is an always-available synchronized PWA on phones,
tablets, and computers at zero or predictably near-zero recurring cost. This is a
cost and usability target, not a guarantee that any provider will keep a particular
free offer.

The detailed user journeys, capability tiers, and open research questions are in
[Installation and Deployment Experience](../architecture/installation-and-deployment-experience.md).
The shared release and upgrade contract is in
[Versioning, Release, and Update Lifecycle](../architecture/versioning-release-and-update-lifecycle.md).

## Initial Experiences

1. A safe public demo for trying ApiaryLens without installation.
2. A researched device-local personal PWA mode without a required server account.
3. A guided `Scout Bee` bootstrapper that presents the ranked deployment profiles.
4. Docker Compose as the first complete server deployment on personally controlled
   hardware.
5. A Cloudflare-native profile as the first cloud deployment target, with published
   limits, measured costs, backup, restore, and migration guidance.
6. Docker Compose on an ordinary Linux VM as the second cloud target and portable
   fallback.

The intended Compose experience remains:

```text
docker compose up -d
```

That command does not replace guided onboarding, backup, restore, update,
diagnostics, and recovery workflows.

## Principles

- Self-hosted and offline-first
- No required paid cloud account
- No required maintainer-private, cloud, or internal project service
- Provider-neutral OCI images and Compose artifacts for every complete self-hosted
  release
- Cloudflare-native family profile first among cloud deployments, subject to
  measured acceptance gates
- Local media storage first; optional S3-compatible storage later
- Same contracts and portable data across personal, family, and organization tiers
- Hosted demo and optional SaaS consume the same core product
- No promise that a third-party free tier will remain free or available

## MVP Lifecycle

Every supported server profile must be installable, updateable, recoverable, and
traceable to an exact release. Scout Bee provides the guided lifecycle for its MVP
targets, while documented Cloudflare and Compose procedures provide an independent
operator path.

An update discovers an explicit compatible release, performs preflight checks,
creates and verifies a backup, stages immutable artifacts, applies versioned
migrations, activates the release, verifies health and contract compatibility, and
then commits the installed release identity. Failure invokes safe resume,
application rollback, or full restore according to schema compatibility.

PWA updates must preserve active forms, the local record store, pending mutations,
and staged media. A server deployment is never silently auto-updated by default.

## Secrets and Private Operations

The open-source product documents portable secret inputs and safe options such as
environment variables, Docker secrets, mounted secret files, and optional external
secret-manager adapters. It does not depend on the maintainer's private identity,
vault, governance, or deployment systems.

Provider-specific secret stores, hosted-service credentials, private naming rules,
and internal automation belong in `apiarylens-ops` or a future private
infrastructure repository.

## Public Frontend Hosting

All official `apiarylens.org`, `apiarylens.app`, and `apiarylens.dev` frontends use
Cloudflare. New properties target Workers Static Assets, custom domains, managed
TLS, and reviewed preview/production workflows as defined by
[ADR 0006](../adr/0006-cloudflare-public-frontends.md).

This is separate from product-server deployment. The PWA frontend may be served by
Cloudflare while its API, PostgreSQL database, media storage, and synchronization
services run in a portable Compose deployment, provider-neutral VM, another cloud,
or a future managed ApiaryLens environment. Self-hosting never requires a
Cloudflare account.

## Deployment Priority

For personally controlled hardware, Docker Compose is the first supported complete
server target. A device-only PWA remains available as a lighter personal mode after
its storage and recovery model is proven.

For cloud deployment, the priority is:

1. Cloudflare-native family cloud using evaluated Workers, D1, R2, and related
   services
2. Docker Compose on a provider-neutral Linux VM, including Azure, AWS, GCP, or
   another suitable provider
3. Later provider-specific managed-container or infrastructure templates
4. Future optional managed ApiaryLens service

Cloudflare's position is an implementation priority, not permission to couple the
portable core to a required provider. See
[ADR 0007](../adr/0007-deployment-profile-priority.md).

## Future Deployment Tracks

- Provider-neutral VM or container-host instructions for the Compose cloud fallback
- Optional Azure, AWS, GCP, or other convenience templates after the two primary
  cloud profiles
- Kubernetes and Helm after there is demonstrated operational need
- Managed hosted service
- Commercial/research capacity profiles

Provider-specific work requires research and an ADR. See
[Cloud Free-Tier Deployment Spike](../research/cloud-free-tier-deployment-spike.md).

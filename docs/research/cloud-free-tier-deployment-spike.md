# Cloud Free-Tier Deployment Spike

## Status

Initial research completed 2026-07-15. Revalidate before selecting or publishing a
provider-specific deployment because offers and limits change.

## Question

Can the Cloudflare-first family profile support the near-free synchronized family
target, and can Docker Compose on an ordinary cloud VM provide a dependable portable
fallback without replacing or forking the core product?

Cloudflare hosting for the official `.org`, `.app`, and `.dev` frontends is already
accepted by ADR 0006 and is not under evaluation in this spike. This spike evaluates
application backend, data, media, and synchronization hosting.

## Findings

- Azure advertises a time-limited introductory credit, service-specific 12-month
  allowances, and always-free services with limits. Signup verification requires a
  payment card. See [Azure Free Account](https://azure.microsoft.com/free/).
- AWS currently offers new customers credits for a free plan lasting up to six
  months; the free-plan account closes when the period or credits end unless it is
  converted. See [AWS Free Tier](https://aws.amazon.com/free/).
- Google Cloud offers introductory credit and an ongoing free tier with product and
  usage limits that are explicitly subject to change. See
  [Google Cloud Free Program](https://cloud.google.com/free/).
- Cloudflare Workers and D1 have useful free allowances, but they enforce daily or
  total limits. D1 is a Cloudflare-managed SQLite service and would not be a
  transparent deployment of a PostgreSQL-based core. See
  [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
  and [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## Recommendation

Implement and test Cloudflare first among cloud profiles, as accepted by
[ADR 0007](../adr/0007-deployment-profile-priority.md), but do not make its free tier
the core ApiaryLens architecture or promise that a deployment will remain free.
Account creation, payment verification, time-limited credits, hard quotas, and
provider-specific services remain product risks that require visible safeguards and
a migration path.

This does not remove the goal of a free or near-free family cloud deployment. It
means that goal must be proven against a reference workload, measured regularly,
published with limits, and backed by a portable migration path rather than assumed
from marketing labels.

Build provider-neutral product artifacts alongside the Cloudflare profile:

- Installable PWA and researched device-local mode
- OCI container images
- Docker Compose server profile
- Documented volumes, backup, restore, and upgrades
- A versioned deployment-plan format

Docker Compose on a generic Linux VM is the second cloud target. Later provider
templates may deploy those same artifacts to a VM or container platform. The
Cloudflare-native implementation requires follow-up technical ADRs because it
changes runtime, storage, operations, and testing while remaining bound to the same
public contracts and portable exports.

The follow-up is
[`tasks/006-research-family-cloud-profile.md`](../../tasks/006-research-family-cloud-profile.md).

## Remaining Questions

- What is the lowest supported local footprint?
- Can personal mode safely avoid a server while preserving reliable backups?
- Which generic VM sizes pass capacity tests for family use?
- Does the Cloudflare profile pass the family workload, quota-exhaustion, backup,
  restore, export, and migration gates?
- Which provider templates can be maintained without implying guaranteed free use?
- What support burden is created by each provider's account, DNS, TLS, and billing flow?

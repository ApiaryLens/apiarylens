# Cloud Free-Tier Deployment Spike

## Status

Initial research completed 2026-07-15. Revalidate before selecting or publishing a
provider-specific deployment because offers and limits change.

## Question

Which optional Cloudflare-native, Azure, AWS, Google Cloud, or provider-neutral
backend profile can support the near-free synchronized family target without
replacing the portable core?

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

Do not make any provider's free tier the primary ApiaryLens architecture or promise
that a deployment will remain free. Account creation, payment verification,
time-limited credits, hard quotas, and provider-specific services conflict with the
goal of a simple and durable family installation.

This does not remove the goal of a free or near-free family cloud deployment. It
means that goal must be proven against a reference workload, measured regularly,
published with limits, and backed by a portable migration path rather than assumed
from marketing labels.

Build provider-neutral product artifacts first:

- Installable PWA and researched device-local mode
- OCI container images
- Docker Compose server profile
- Documented volumes, backup, restore, and upgrades
- A versioned deployment-plan format

Later provider templates may deploy those same artifacts to a generic VM or
container platform. A provider-native/serverless implementation requires its own
research and ADR because it changes portability, storage, operations, and testing.

The follow-up is
[`tasks/006-research-family-cloud-profile.md`](../../tasks/006-research-family-cloud-profile.md).

## Remaining Questions

- What is the lowest supported local footprint?
- Can personal mode safely avoid a server while preserving reliable backups?
- Which generic VM sizes pass capacity tests for family use?
- Which provider templates can be maintained without implying guaranteed free use?
- What support burden is created by each provider's account, DNS, TLS, and billing flow?

# ADR 0007: Deployment Profile Priority

## Status

Accepted

## Date

2026-07-15

## Context

ApiaryLens must give a family or hobbyist beekeeper an always-available,
synchronized application at zero or predictably near-zero cost while preserving a
complete self-hosted path that requires no cloud provider. Earlier planning mixed
device-only use, deployment on personally controlled hardware, cloud deployment,
and a future managed service into one sequence. That made Docker Compose appear to
be the default experience for every user and left the priority among cloud profiles
unclear.

Docker Compose is portable across home hardware and ordinary cloud virtual
machines. A Cloudflare-native profile using Workers, D1, R2, and related services
may provide a simpler and lower-operations family-cloud experience, but it has a
different runtime, database, quota, and portability model. Current free allowances
are useful inputs, not permanent product guarantees.

## Decision

Separate deployment choices by operating model and use the following priority.

### Personally controlled hardware

1. Docker Compose is the first supported complete server deployment for a laptop,
   desktop, mini-PC, home server, NAS where supported, or local virtual machine.
2. A researched device-only PWA remains the lighter personal option when no server,
   multi-device synchronization, or network access is required.

### Cloud deployments

1. A Cloudflare-native family-cloud profile is the first cloud implementation and
   recommendation target, subject to the Task 006 evidence and acceptance gates.
2. Docker Compose on an ordinary Linux cloud VM is the second cloud target and the
   portable provider-neutral fallback.
3. Provider-specific managed-container or infrastructure templates may follow when
   they materially improve cost or usability without changing product contracts.
4. A managed ApiaryLens service remains a future optional SaaS path.

The expected Cloudflare profile will evaluate Workers Static Assets for the PWA,
Workers for the API, D1 for relational data, and R2 for media. This ADR sets their
implementation priority; it does not accept a framework, schema, storage adapter,
authentication design, or claim that the current free allowances will satisfy the
supported family workload. Those decisions require measured research and follow-up
ADRs.

Docker Compose remains the portability baseline and must never depend on a
Cloudflare account. The Cloudflare and Compose profiles must share versioned domain
rules, API and synchronization contracts, authorization behavior, deployment-plan
semantics, and portable data and media export formats. Provider-specific adapters
must have a documented migration path.

`Scout Bee` should present plain-language choices in this order:

1. Family Cloud - Cloudflare
2. My Own Hardware - Docker Compose
3. Cloud Virtual Machine - Docker Compose
4. Only This Device
5. Advanced deployment-plan export

The exact labels and order may be adjusted by usability research, but they must
preserve the deployment priorities and explain ownership, availability, cost, and
portability consequences.

## Alternatives Considered

### Docker Compose first for every environment

This maximizes implementation reuse, but makes the recommended family cloud depend
on VM administration, patching, TLS, backups, and ongoing server cost. Compose
remains the first self-hosted server target and second cloud target instead.

### Cloudflare as the only backend

This could minimize initial hosted operations but would require a Cloudflare account
and make self-hosting second-class. It was rejected.

### Leave cloud profiles unranked

This avoids an early commitment but provides no implementation or research
priority. It was rejected because the family-cloud experience is a primary product
outcome.

## Consequences

- The project will likely maintain Cloudflare-native and portable server runtime or
  storage adapters; shared behavior and conformance tests are mandatory.
- Cloudflare research and prototypes occur before generic cloud-VM convenience
  templates, while Compose design proceeds as the self-hosted baseline.
- Quota exhaustion, cost controls, backup, restore, export, migration, media growth,
  and provider account setup become release gates for the Cloudflare profile.
- Azure and other time-limited free VM offers may be documented as onboarding or
  evaluation opportunities, never as permanent-free promises.
- Cloudflare failure or an unacceptable research result does not block ApiaryLens;
  Docker Compose on local hardware or an ordinary VM remains the supported fallback.

## Follow-up Work

- Complete [Task 006](../../tasks/006-research-family-cloud-profile.md) with a dated
  reference workload, measured prototype, cost envelope, and migration proof.
- Accept follow-up ADRs for runtime, data access, storage adapters, authentication,
  synchronization, media, backup, and quota behavior.
- Update Scout Bee and deployment-plan designs to represent the ranked profiles.
- Add Cloudflare-native and Compose-on-VM conformance journeys to the deployment test
  strategy.

## References

- [ADR 0003: Open Source and Self-Hosted First](0003-open-source-first.md)
- [ADR 0006: Cloudflare Hosting for Public Frontends](0006-cloudflare-public-frontends.md)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Azure free services](https://azure.microsoft.com/pricing/free-services/)

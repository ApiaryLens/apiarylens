# Task 005: Plan MVP

Create a detailed MVP implementation plan.

The default MVP user is a family or hobbyist beekeeper. The plan must optimize for a
guided start, updates, backup, restore, and clear data ownership without requiring
container, database, DNS, TLS, identity-provider, or cloud-billing expertise.

The MVP should include:

- Auth
- Organizations
- Apiaries
- Hives
- Queens
- Equipment
- Inspections
- Photos
- Mite counts
- Feeding
- Treatments
- Harvest records
- Weather history foundation
- Bloom calendar foundation
- Docker Compose as the first complete server deployment on owned hardware
- Cloudflare-native family cloud as the first cloud deployment target
- Docker Compose on an ordinary Linux VM as the second cloud deployment target
- PWA
- Researched device-local personal mode
- Offline synchronization foundation
- Basic family membership and multi-device access
- Backup, restore, and export
- Versioned deployment-plan JSON schema
- `Scout Bee` guided-deployment spike and prototype
- Safe public demo
- Cloudflare-hosted `.org` project frontend and `.app` PWA/demo frontend foundation
- Cloudflare-hosted `.dev` foundation ready to publish generated developer material
  when versioned contracts exist
- Public brand brief, approved PWA/application assets, licensing, and provenance
- Near-free, always-available family cloud reference research
- iPhone, iPad, and desktop PWA acceptance testing

Break work into small implementation tasks.

Use
[`docs/architecture/installation-and-deployment-experience.md`](../docs/architecture/installation-and-deployment-experience.md)
as the deployment-experience source of truth. Do not select a storage engine,
bootstrapper runtime, networking approach, or cloud provider without the required
research and ADR. The deployment priority itself is accepted by
[ADR 0007](../docs/adr/0007-deployment-profile-priority.md).

Use the [Execution Plan](../docs/roadmap/execution-plan.md) for the required sequence
from research through decisions, detailed design, implementation, verification, and
deployment. The final MVP feature boundary must be justified by discovery rather
than treating this candidate list as an already accepted specification.

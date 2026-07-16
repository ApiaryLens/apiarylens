# ApiaryLens MVP UAT Record

## Purpose

This is the executable acceptance record for the critical journey in
[`mvp-definition.md`](../product/mvp-definition.md). A checked item requires recorded
evidence from the named release and profile; implementation or unit tests alone do
not satisfy it.

## Build Under Test

- Acceptance candidate: ApiaryLens 0.1.0-rc.6
- Superseded candidate: ApiaryLens 0.1.0-rc.3 (rejected by clean-Ubuntu default-target
  installation smoke test)
- Superseded candidate: ApiaryLens 0.1.0-rc.2 (rejected by exact-artifact runtime
  identity smoke test)
- Lifecycle predecessor evidence: ApiaryLens 0.1.0-rc.1
- Release channel: release-candidate
- API: 1.0
- Sync: 1
- Database migration: 0004
- Deployment plan: 1
- Export/local store: 1
- Required profiles: Cloudflare family; Hyper-V Linux Docker Compose
- Conditional/reference profile: disposable Azure Linux VM Docker Compose

## Critical Journey

- [x] Verify manifest, signatures, SBOM, provenance, and content-addressed artifacts.
- [x] Deploy Cloudflare family profile with Scout Bee into an isolated UAT target.
- [x] Deploy the same Compose release to the approved Hyper-V Linux VM with Scout Bee.
- [x] Confirm public HTTPS, secure headers, private storage, health, and build identity.
- [x] Create the first owner and family using the one-time protected setup flow.
- [ ] Invite a beekeeper and viewer; accept each invitation on another device.
- [x] Prove viewer write/export/admin requests fail at the server.
- [x] Create an apiary, two hives, queen, and essential equipment.
- [ ] Start an inspection offline, add observations and photos, close the app, reopen,
      and complete it without losing work.
- [ ] Reconnect and prove records, originals, thumbnails, and follow-ups synchronize.
- [ ] On a second device, verify the latest inspection and complete a follow-up.
- [ ] Create mite counts, feeding, treatment, harvest, and verify hive history/trend.
- [ ] Create a same-record conflict on two offline devices and resolve it explicitly.
- [x] Export owned data and validate manifest, JSON, CSV, and original media.
- [x] Back up both profiles, restore into isolated targets, and repeat authenticated
      record/media checks.
- [ ] Update both profiles from a seeded predecessor with backup-before-update,
      migration, health verification, PWA pending-work preservation, and resume or
      rollback proof.
- [x] Export redacted Scout diagnostics and confirm secrets and user data are absent.
- [x] Uninstall with keep-data, reinstall, and prove retained data recovery.
- [ ] Run keyboard, screen-reader landmark, contrast, zoom, and target-size checks on
      onboarding, dashboard, inspect, conflict, family, export, and update views.
- [ ] Record elapsed install time, active family cost, failures, mitigations, tester,
      device/browser/OS matrix, and evidence links below.

## Evidence Log

| Date | Profile/device | Step | Result | Evidence | Notes |
|---|---|---|---|---|---|
| 2026-07-15 | Public demo / mobile viewport | Offline draft and synchronization | Pass | Browser-controlled live journey | Synthetic demo only; not deployment UAT |
| 2026-07-15 | Cloudflare production service | Protected backup endpoint | Pass | Temporary secret, 200 ZIP, manifest plus seven database files | Read-only backup proof; restore not run against production |
| 2026-07-15 | Release CDN | Three release downloads | Pass | Remote byte counts and SHA-256 equal manifest | Cloudflare, Compose, Scout Bee Windows |
| 2026-07-15 | Hyper-V host | VM discovery | Blocked | `Get-VM` authorization failure | Requires elevated Hyper-V access or approved SSH target |
| 2026-07-15 | Isolated Cloudflare family UAT | Protected bootstrap through destructive restore | Pass | [`cloudflare-uat-evidence-2026-07-15.json`](cloudflare-uat-evidence-2026-07-15.json) | Runtime `d0f4320`; 10 automated checks passed; temporary bootstrap and operator secrets removed after the run |
| 2026-07-15 | Isolated Cloudflare family UAT | Migration 0004 identity hardening through destructive restore | Pass | [`cloudflare-uat-evidence-2026-07-15-v2.json`](cloudflare-uat-evidence-2026-07-15-v2.json) | Runtime `037d548`; 11 automated checks passed, including opaque session rotation; temporary bootstrap and operator secrets removed while the durable authentication root was retained |
| 2026-07-15 | Released Scout Bee / isolated Cloudflare UAT | Dry-run preflight and redacted diagnostics | Pass | [`scout-bee-cloudflare-preflight-2026-07-15.json`](scout-bee-cloudflare-preflight-2026-07-15.json) | Five phases passed in 2.61 seconds; runtime and loopback credentials were absent from diagnostics; no deployment applied |
| 2026-07-15 | Cloudflare production family profile | Observation and current cost baseline | Pass | [`cloudflare-family-cost-and-observation-2026-07-15.md`](cloudflare-family-cost-and-observation-2026-07-15.md) | More than 41 minutes observed; quiet release-candidate traffic only, with dated allowances and explicit exclusions |
| 2026-07-15 | GitHub/Sigstore release identity | Six release subjects signed and independently verified | Pass | [`release-signing-evidence-2026-07-15.json`](release-signing-evidence-2026-07-15.json) | Run `29455586598` signed verification revision `61622f8`; exact repository workflow identity, GitHub-hosted runner, OIDC certificate and Rekor timestamp; all CDN bytes match |
| 2026-07-15 | Current released Scout Bee / isolated Cloudflare UAT | Refreshed cost-aware executable dry-run preflight | Pass | [`scout-bee-cloudflare-preflight-2026-07-15-v2.json`](scout-bee-cloudflare-preflight-2026-07-15-v2.json) | Current executable and manifest digests; five phases passed in 4.57 seconds; sanitized diagnostics; no deployment applied |
| 2026-07-15 | Current released Scout Bee / isolated Cloudflare UAT | Guarded update apply and redacted diagnostics | Pass | [`scout-bee-cloudflare-update-2026-07-15.json`](scout-bee-cloudflare-update-2026-07-15.json) | All 17 phases passed, including verified backup before migration, resource reuse, migration, deployment, exact release identity, retained records/media, secret cleanup, and sanitized diagnostics |
| 2026-07-15 | Current released Scout Bee / isolated Cloudflare lifecycle UAT | Seeded predecessor, interrupted update/resume, retained state, and full restore | Pass | [`scout-bee-cloudflare-lifecycle-2026-07-15.json`](scout-bee-cloudflare-lifecycle-2026-07-15.json) | Migration-0003 predecessor seeded; update canceled before the real migration command; same plan resumed after bounded edge-identity polling; exact released executable passed 17 phases; migration-0003 restore rejected safely; migration-0004 restore passed 9 phases with records/media retained and sessions revoked |
| 2026-07-15 | Exact released Scout Bee / isolated Cloudflare install UAT | Fresh install, protected owner setup, keep-data uninstall, and reinstall | Pass | [`scout-bee-cloudflare-install-reinstall-2026-07-15.json`](scout-bee-cloudflare-install-reinstall-2026-07-15.json) | Exact `a0db8b48…` executable passed both 14-phase installs; invalid setup code rejected; public route removed; retained apiary, original session, and password sign-in survived; isolated resources deleted after verification |
| 2026-07-16 | Node and Cloudflare API implementations | Route-by-route authorization, cross-family reads/writes, revoked membership, OpenAPI parity, and deployment exposure | Pass | [`authorization-and-exposure-audit-2026-07-16.md`](authorization-and-exposure-audit-2026-07-16.md) | No critical/high finding; complete workspace verification passed; next immutable candidate still requires deployed smoke checks |
| 2026-07-16 | Released Scout Bee / disposable Azure Linux Compose UAT | Fresh install through full product and lifecycle journey | Pass | [`scout-bee-azure-compose-lifecycle-2026-07-16.json`](scout-bee-azure-compose-lifecycle-2026-07-16.json) | Signed public Compose and Scout artifacts; 15-second install; protected bootstrap; all resource types; sync/conflict; private media; viewer denial; complete export; restore/session revocation; 14-backup retention; keep-data reinstall; seeded-0003 interrupted update/same-plan resume; redacted diagnostics |
| 2026-07-16 | Azure Linux Compose family baseline | Quiet resource use and planning cost | Pass | [`scout-bee-azure-compose-lifecycle-2026-07-16.json`](scout-bee-azure-compose-lifecycle-2026-07-16.json) | 54.74 MiB combined quiet container memory, 0.00% sampled CPU, 286,762 data bytes, 380,134 bytes across 14 backups, and estimated compute at USD 0.04/hour before disk, IPv4, egress, and taxes |
| 2026-07-16 | Approved Generation 2 Hyper-V Ubuntu Compose target | Exact released Scout Bee and full server lifecycle | Pass | [`scout-bee-hyperv-compose-lifecycle-2026-07-16.json`](scout-bee-hyperv-compose-lifecycle-2026-07-16.json) | Six-phase preflight; 12-phase clean install; all P0 records, roles, sync/conflict, private media and export; destructive and clean-state restore; 14-backup retention; keep-data reinstall; seeded-0003 interrupted update/same-plan resume; redacted diagnostics; 48.03 MiB sampled quiet container memory |
| 2026-07-16 | Exact public rc.4 / Cloudflare and clean Ubuntu Compose | Publication, signing, byte verification, clean install, exact health, and cleanup | Pass | [`rc4-exact-public-deployment-smoke-2026-07-16.json`](rc4-exact-public-deployment-smoke-2026-07-16.json) | Public CI `29499014709`; signing `29499211922`; all six CDN subjects matched and attested; Cloudflare 14/14; Compose 13/13 at `/opt/apiarylens`; rc.4/source `df853cd`/migration `0004`; Compose uninstall 8/8; all disposable cloud and local helpers removed |
| 2026-07-16 | Live rc.4 synthetic demo / Chrome desktop | Keyboard traversal, focus visibility, target size, responsive reflow, local save, reload, and one-time synchronization | Pass | [`desktop-chrome-uat-2026-07-16.json`](desktop-chrome-uat-2026-07-16.json) | Synthetic records only; no focus trap; controls at least 44 CSS pixels high; no overflow at 390-by-844 or 820-by-1180; the new inspection survived reload and synchronized once; physical devices, assistive technology, 200% zoom, forced colors, photos, and released update remain open |

The current isolated Cloudflare run additionally exercised invitations with three
independent sessions, all 13 P0 resource types, original and thumbnail media, sync
pull/push, follow-up completion, idempotent replay, a stale-version conflict, immediate
rejection of a rotated session identifier, and session revocation after restore. The
post-run target remained closed to bootstrap with one atomic bootstrap claim, and only
the durable `AUTH_ROOT_SECRET` remained configured. A separate isolated lifecycle
target now proves the Cloudflare seeded-predecessor update, interruption/resume, and
compatible full-restore path. A second isolated target proves fresh installation and
the Cloudflare half of keep-data uninstall/reinstall, including retained identity and
data. The approved Generation 2 Hyper-V target now independently proves the exact
released Compose preflight, clean install, product, backup/restore, 14-backup
retention, keep-data reinstall, seeded-predecessor interrupted update/same-plan
resume, and a portable restore into a fresh application target with zero initial
users and records. The conditional Azure Linux VM remains provider-neutral reference
evidence. Physical-device invitation/offline PWA/update journeys and manual
assistive-technology checks remain open because their acceptance wording requires
separate human-operated device evidence.

## Acceptance

Release acceptance requires every critical checkbox, zero unresolved critical or
high-severity security/accessibility defects, and signed approval by the project
owner. Until then the release remains a candidate and the MVP goal remains open.

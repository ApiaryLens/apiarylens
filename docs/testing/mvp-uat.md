# ApiaryLens MVP UAT Record

## Purpose

This is the executable acceptance record for the critical journey in
[`mvp-definition.md`](../product/mvp-definition.md). A checked item requires recorded
evidence from the named release and profile; implementation or unit tests alone do
not satisfy it.

## Build Under Test

- Product: ApiaryLens 0.1.0-rc.1
- Release channel: release-candidate
- API: 1.0
- Sync: 1
- Database migration: 0003
- Deployment plan: 1
- Export/local store: 1
- Required profiles: Cloudflare family; Hyper-V Linux Docker Compose
- Conditional profile: existing Azure Linux VM Docker Compose

## Critical Journey

- [ ] Verify manifest, signatures, SBOM, provenance, and content-addressed artifacts.
- [ ] Deploy Cloudflare family profile with Scout Bee into an isolated UAT target.
- [ ] Deploy the same Compose release to the approved Hyper-V Linux VM with Scout Bee.
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
- [ ] Back up both profiles, restore into isolated targets, and repeat authenticated
      record/media checks.
- [ ] Update both profiles from a seeded predecessor with backup-before-update,
      migration, health verification, PWA pending-work preservation, and resume or
      rollback proof.
- [ ] Export redacted Scout diagnostics and confirm secrets and user data are absent.
- [ ] Uninstall with keep-data, reinstall, and prove retained data recovery.
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

The isolated Cloudflare run additionally exercised invitations with three independent
sessions, all 13 P0 resource types, original and thumbnail media, sync pull/push,
follow-up completion, idempotent replay, a stale-version conflict, and session
revocation after restore. Those results do not check the physical-device, offline PWA,
Scout Bee deployment, Compose, update/rollback, accessibility, or uninstall steps
whose wording requires separate evidence.

## Acceptance

Release acceptance requires every critical checkbox, zero unresolved critical or
high-severity security/accessibility defects, and signed approval by the project
owner. Until then the release remains a candidate and the MVP goal remains open.

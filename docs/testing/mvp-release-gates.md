# MVP Release Gate Checklist

**Release:** 0.1.0-rc.7

**Date:** 2026-07-16

**Status:** Published acceptance candidate; owner/device gates remain open

rc.4 supersedes rc.3 because exact published-byte Compose smoke testing found that
Scout Bee could not create its documented `/opt/apiarylens` target on a clean Ubuntu
host. The corrected installer performs an explicit writable-directory preflight,
safely creates a missing target only with passwordless sudo, and rejects unsafe or
foreign-owned targets. rc.4 is now verified, signed, published, independently
attested, and proven through exact-public-byte Cloudflare and clean Ubuntu Compose
installs. Final stable acceptance requires only the remaining hands-on owner/device
gates.

## Pre-Deploy

- [x] Workspace format, type checks, unit tests, Go tests, builds, and local
      backup/restore verification pass.
- [x] Cloudflare Worker and all three public properties are deployed over HTTPS.
- [x] Public properties use no telemetry and block automatic response transformation.
- [x] Deployment bundles are content-addressed, and every published release artifact
      is remotely digest verified against the manifest.
- [x] The rc.4 manifest and both exact deployed profiles identify implementation
      commit `df853cd4204cc9b1a47424460ae895e228d7ebbf` and UTC build time
      `2026-07-16T12:24:50.0323563Z`.
- [x] CycloneDX SBOM, license report, and unsigned provenance are published and
      remotely digest verified with the deployment bundles and Scout Bee executable.
- [x] All deployment artifacts, Scout Bee, SBOM, license report, and provenance are
      keylessly signed by the approved repository workflow identity, transparency
      logged, independently verified, and byte-equal to the public CDN copies.
- [x] Compose and Cloudflare report the same immutable migration head (`0004`), the
      ordered Compose migration test passes, a production pre-migration snapshot was
      captured, and Cloudflare applied `0004` successfully.
- [x] Complete seeded-predecessor update, interruption/resume, and full-restore
      recovery scenarios on isolated Cloudflare and Azure Compose UAT deployments;
      the separate required Hyper-V target gate remains open below.
- [x] Automated axe checks report no violations on `.org`, documentation, `.app`, the
      isolated demo, and both `.dev` entry points; dependency audit reports no known
      high-severity vulnerabilities.
- [x] The release-scope threat model and OWASP ASVS 5.0.0 chapter map document
      implemented, partial, and non-applicable controls without claiming certification.
- [x] Public MVP verification run `29499014709` passes for rc.4 release revision
      `e15a03b3800a8d636615144c36bf24a7b7841497`, whose manifest pins product-source
      revision `df853cd4204cc9b1a47424460ae895e228d7ebbf`, including the secret scan,
      complete workspace verification, clean Compose image builds, and release checks.
- [x] The SHA-256-pinned Grype 0.115.0 CI scan reports no unresolved high or critical
      vulnerability in either Compose runtime image at that revision.
- [x] Automated WCAG 2.1 A/AA scans and live browser-controlled structural,
      responsive, icon, and 44-by-44-pixel target checks pass on the public `.org`,
      `.app`, and `.dev` entry surfaces at 375- and 320-pixel widths.
- [ ] Manual keyboard, screen-reader, 200% zoom, and security review evidence has no
      open critical/high findings.
- [x] Seven required Lucidchart pages have accessible PNG exports and are cataloged.
- [x] All cataloged editable Lucidchart sources are filed in the dedicated ApiaryLens
      Lucid folder; the seven-page operational source was verified and moved there on
      2026-07-15 without changing its document ID.
- [x] Final Lucidchart visual-polish review passes after the three pages with recorded
      label and connector collisions were rebuilt, filed, re-exported, and visually
      rechecked; rejected drafts are outside the authoritative folder.
- [x] The released Scout Bee Windows executable passes a secret-redacted, pinned
      release preflight and 17-phase guarded updates against isolated Cloudflare UAT
      resources, including backup-before-migration, an intentional stop at the
      migration boundary, same-plan resume, bounded edge-identity convergence,
      migration, deployment, retained data/media, incompatible-backup rejection,
      compatible full restore, session revocation, cleanup, and redacted diagnostics.
- [x] The exact released Scout Bee executable passes a fresh isolated Cloudflare
      install, protected first-owner claim, invalid-code rejection, keep-data
      uninstall, public-route removal, and reinstall while preserving the original
      session, password sign-in, retained apiary, and durable authentication root.
- [x] The approved Generation 2 Hyper-V Ubuntu target passes the exact released
      Scout Bee preflight, clean install, product, recovery, retention, keep-data
      reinstall, interrupted-update/resume, and clean-application restore journeys.
- [x] The isolated Cloudflare family service passes protected bootstrap, roles, all
      P0 resource types, private media, sync, conflict/idempotency, negative viewer
      authorization, portable export, destructive restore, session rotation and
      revocation, atomic bootstrap claiming, and record/media recovery at migration
      `0004` and runtime revision `037d548`.
- [x] The released provider-neutral Compose profile passes signed fresh install on a
      disposable Azure Linux VM, protected bootstrap, release-scope records, private
      media, sync/conflict/idempotency, viewer denial, complete export, backup/restore
      with session revocation, 14-backup retention, keep-data reinstall, and a seeded
      migration-0003 interrupted update resumed with the same plan.
- [x] Exact rc.4 production downloads match all manifest hashes and sizes; signing run
      `29499211922` verifies all six subjects. The exact public Scout passes a 14-phase
      Cloudflare install and a 13-phase clean Ubuntu Compose install at
      `/opt/apiarylens`; both profiles report rc.4, source `df853cd`, and migration
      `0004`, and all disposable resources are removed.

## Deploy

- [x] Deploy to isolated Cloudflare and Hyper-V UAT targets.
- [ ] Run the complete [MVP UAT record](mvp-uat.md) on both required profiles.
- [x] Exercise backup, restore, predecessor update, interrupted update/resume,
      compatible rollback, keep-data uninstall, and recovery.
- [x] Verify organization isolation and negative authorization on every scoped route.
      Engineering review and both implementation suites pass as recorded in
      [`authorization-and-exposure-audit-2026-07-16.md`](authorization-and-exposure-audit-2026-07-16.md),
      and the exact immutable rc.4 deployment smokes pass.
- [ ] Verify offline draft, media staging, synchronization, and conflict behavior on
      iPhone, iPad, and computers.

## Post-Deploy

- [x] Verify production release identity after a 15-minute observation window.
- [x] Record the dated Cloudflare quota/cost baseline and planning assumptions.
- [ ] Record install time, device matrix, and all remaining evidence links.
- [ ] Publish final release notes, changelog, support window, known limitations, and
      recovery guidance.
- [ ] Obtain project-owner acceptance.

## Isolated Cloudflare Evidence

The current automated Cloudflare journey is recorded in
[`cloudflare-uat-evidence-2026-07-15-v2.json`](cloudflare-uat-evidence-2026-07-15-v2.json),
with the earlier migration-0003 run retained as historical evidence. After the passing
restore, the target remained healthy at migration `0004`, bootstrap was closed, both
temporary deployment secrets were removed, and only the durable authentication-root
secret remained configured. The restored database contained three users, one
organization, three memberships, 13 P0 resources, one session, and one atomic
bootstrap claim; private R2 held the recovered original and thumbnail. This evidence
advances the Cloudflare data-path gate but does not satisfy the remaining combined
Cloudflare-plus-Compose or physical-device gates.

The current released Scout Bee guarded Cloudflare update is recorded in
[`scout-bee-cloudflare-update-2026-07-15.json`](scout-bee-cloudflare-update-2026-07-15.json).
The seeded-predecessor, interrupted-update/resume, propagation fix, exact released
executable rerun, retained-data checks, incompatible-backup rejection, and compatible
full restore are recorded in
[`scout-bee-cloudflare-lifecycle-2026-07-15.json`](scout-bee-cloudflare-lifecycle-2026-07-15.json).
Fresh install and keep-data uninstall/reinstall are recorded in
[`scout-bee-cloudflare-install-reinstall-2026-07-15.json`](scout-bee-cloudflare-install-reinstall-2026-07-15.json).
That completes the Cloudflare half of both lifecycle gates; the combined checkboxes
stay open for the required Compose runs. The two earlier
dry-run preflights and first guarded update remain historical evidence. Release-signing
evidence for verification revision `b3094bc1ae944db48aad8d6555581194acbb3a0b` is recorded in
[`release-signing-evidence-2026-07-15.json`](release-signing-evidence-2026-07-15.json).
The production observation and provider-allowance baseline is recorded in
[`cloudflare-family-cost-and-observation-2026-07-15.md`](cloudflare-family-cost-and-observation-2026-07-15.md).
The conditional provider-neutral Azure Compose install, product, recovery, reinstall,
update, signing, resource, and cost evidence is recorded in
[`scout-bee-azure-compose-lifecycle-2026-07-16.json`](scout-bee-azure-compose-lifecycle-2026-07-16.json).
It remains useful provider-neutral reference evidence but no longer substitutes for
the required approved Hyper-V run. The independent Generation 2 Hyper-V install,
product, recovery, retention, keep-data reinstall, interrupted update/resume, clean
application-state restore, exposure, and resource proof is recorded in
[`scout-bee-hyperv-compose-lifecycle-2026-07-16.json`](scout-bee-hyperv-compose-lifecycle-2026-07-16.json).
The corrective rc.4 publication, public-byte verification, signing, 14-phase
Cloudflare install, 13-phase clean Ubuntu `/opt/apiarylens` install, exact runtime
identity, 8-phase Compose uninstall, and complete disposable-resource cleanup are
recorded in
[`rc4-exact-public-deployment-smoke-2026-07-16.json`](rc4-exact-public-deployment-smoke-2026-07-16.json).
The remaining combined gates require physical-device offline/update evidence, manual
assistive-technology and security review, and project-owner acceptance.

## Rollback Triggers

Rollback or stop immediately for failed health identity, authentication bypass,
cross-organization access, public media, lost pending work, migration error, backup
verification failure, restore mismatch, or failure of any critical UAT step.

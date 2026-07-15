# MVP Release Gate Checklist

**Release:** 0.1.0-rc.1  
**Date:** 2026-07-15  
**Status:** Not yet releasable

## Pre-Deploy

- [x] Workspace format, type checks, unit tests, Go tests, builds, and local
      backup/restore verification pass.
- [x] Cloudflare Worker and all three public properties are deployed over HTTPS.
- [x] Public properties use no telemetry and block automatic response transformation.
- [x] Release artifacts are content-addressed and remotely digest verified.
- [x] The live PWA/backend identity and manifest identify implementation commit
      `037d54881f79a9381212b94d4d382dc716bbdffc` and UTC build time
      `2026-07-15T19:54:48.2706596Z`.
- [x] CycloneDX SBOM, license report, and unsigned provenance are published and
      remotely digest verified with the deployment bundles and Scout Bee executable.
- [x] All deployment artifacts, Scout Bee, SBOM, license report, and provenance are
      keylessly signed by the approved repository workflow identity, transparency
      logged, independently verified, and byte-equal to the public CDN copies.
- [x] Compose and Cloudflare report the same immutable migration head (`0004`), the
      ordered Compose migration test passes, a production pre-migration snapshot was
      captured, and Cloudflare applied `0004` successfully.
- [ ] Complete the seeded-predecessor update, interruption, rollback, and restore
      scenarios on the isolated Cloudflare and Compose UAT deployments.
- [x] Automated axe checks report no violations on `.org`, documentation, `.app`, the
      isolated demo, and both `.dev` entry points; dependency audit reports no known
      high-severity vulnerabilities.
- [x] The release-scope threat model and OWASP ASVS 5.0.0 chapter map document
      implemented, partial, and non-applicable controls without claiming certification.
- [x] Public MVP verification run `29451937016` passes for release-evidence revision
      `992d4d74a6e53b05269c131399c9aab5af4727fa`, whose manifest pins product-source
      revision `037d54881f79a9381212b94d4d382dc716bbdffc`, including the secret scan,
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
      release preflight and a 17-phase guarded update against the isolated Cloudflare
      UAT resources, including backup-before-migration, resource reuse, migration,
      deployment, exact build identity, retained data/media, cleanup, and redacted
      diagnostics.
- [ ] The Hyper-V UAT target passes Scout Bee preflight; the combined target gate
      remains open until that independent run succeeds.
- [x] The isolated Cloudflare family service passes protected bootstrap, roles, all
      P0 resource types, private media, sync, conflict/idempotency, negative viewer
      authorization, portable export, destructive restore, session rotation and
      revocation, atomic bootstrap claiming, and record/media recovery at migration
      `0004` and runtime revision `037d548`.

## Deploy

- [ ] Deploy to isolated Cloudflare and Hyper-V UAT targets.
- [ ] Run the complete [MVP UAT record](mvp-uat.md) on both required profiles.
- [ ] Exercise backup, restore, predecessor update, interrupted update/resume,
      compatible rollback, keep-data uninstall, and recovery.
- [ ] Verify organization isolation and negative authorization on every scoped route.
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
The two earlier dry-run preflights are retained as historical evidence. Release-signing
evidence is recorded in
[`release-signing-evidence-2026-07-15.json`](release-signing-evidence-2026-07-15.json).
The production observation and provider-allowance baseline is recorded in
[`cloudflare-family-cost-and-observation-2026-07-15.md`](cloudflare-family-cost-and-observation-2026-07-15.md).

## Rollback Triggers

Rollback or stop immediately for failed health identity, authentication bypass,
cross-organization access, public media, lost pending work, migration error, backup
verification failure, restore mismatch, or failure of any critical UAT step.

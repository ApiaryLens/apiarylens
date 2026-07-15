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
      `6834a6d81d4a3129fba4b6f827a7bf464d8af6b0` and UTC build time
      `2026-07-15T17:46:06.1745511Z`.
- [x] CycloneDX SBOM, license report, and unsigned provenance are published and
      remotely digest verified with the deployment bundles and Scout Bee executable.
- [ ] Release artifacts and provenance are signed with the approved release identity.
- [x] Compose and Cloudflare report the same immutable migration head (`0003`), the
      ordered Compose migration test passes, a production pre-migration snapshot was
      captured, and Cloudflare applied `0003` successfully.
- [ ] Complete the seeded-predecessor update, interruption, rollback, and restore
      scenarios on the isolated Cloudflare and Compose UAT deployments.
- [x] Automated axe checks report no violations on `.org`, documentation, `.app`, the
      isolated demo, and both `.dev` entry points; dependency audit reports no known
      high-severity vulnerabilities.
- [x] The release-scope threat model and OWASP ASVS 5.0.0 chapter map document
      implemented, partial, and non-applicable controls without claiming certification.
- [x] Public MVP verification run `29437744204` passes for the exact product-source
      revision, including the secret scan and clean Compose image builds.
- [ ] The SHA-256-pinned Grype 0.115.0 CI scan reports no unresolved high or critical
      vulnerability in either released Compose image.
- [ ] Manual keyboard, screen-reader, 200% zoom, and security review evidence has no
      open critical/high findings.
- [x] Seven required Lucidchart pages have accessible PNG exports and are cataloged.
- [ ] Confirm the editable Lucidchart source is filed in the dedicated ApiaryLens
      Lucid folder and complete its final visual-polish review.
- [ ] Hyper-V and isolated Cloudflare UAT targets pass Scout Bee preflight.

## Deploy

- [ ] Deploy to isolated Cloudflare and Hyper-V UAT targets.
- [ ] Run the complete [MVP UAT record](mvp-uat.md) on both required profiles.
- [ ] Exercise backup, restore, predecessor update, interrupted update/resume,
      compatible rollback, keep-data uninstall, and recovery.
- [ ] Verify organization isolation and negative authorization on every scoped route.
- [ ] Verify offline draft, media staging, synchronization, and conflict behavior on
      iPhone, iPad, and computers.

## Post-Deploy

- [ ] Verify health and release identity after a 15-minute observation window.
- [ ] Record quota/cost, install time, device matrix, and all evidence links.
- [ ] Publish final release notes, changelog, support window, known limitations, and
      recovery guidance.
- [ ] Obtain project-owner acceptance.

## Rollback Triggers

Rollback or stop immediately for failed health identity, authentication bypass,
cross-organization access, public media, lost pending work, migration error, backup
verification failure, restore mismatch, or failure of any critical UAT step.

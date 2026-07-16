# Changelog

## 0.1.0-rc.5 — 2026-07-16

Corrective remove-data candidate. GCP lifecycle acceptance proved rc.4 left verified
backup archives under the Compose installation directory after a full uninstall.
Scout Bee now removes the complete validated target on remove-data while preserving
the recoverable keep-data path, with regression coverage. See the
[curated release notes](0.1.0-rc.5.md),
[release gates](../testing/mvp-release-gates.md), and
[UAT record](../testing/mvp-uat.md).

## 0.1.0-rc.4 — 2026-07-16

Corrective clean-host installer candidate. It supersedes rc.3 after exact published-byte Compose smoke testing proved Scout Bee could not create the documented default /opt/apiarylens target for a normal Ubuntu administrator. Scout Bee now preflights target access, uses guarded passwordless-sudo creation, rejects unsafe or foreign-owned paths, and carries unit plus clean-host deployment proof. See the [curated release notes](0.1.0-rc.4.md), [release gates](../testing/mvp-release-gates.md), and [UAT record](../testing/mvp-uat.md).

## 0.1.0-rc.3 — 2026-07-16

Corrective runtime-identity candidate. It supersedes `rc.2` after exact-artifact
Cloudflare smoke testing proved that the published bundle had linked a stale compiled
contracts package. Release assembly now rebuilds shared contracts first, injects the
complete frontend identity, builds all release inputs in one ordered command, and
rejects mismatched Worker or PWA bytes before packaging. See the
[curated release notes](0.1.0-rc.3.md), the
[release-gate checklist](../testing/mvp-release-gates.md), and the
[UAT record](../testing/mvp-uat.md).

## 0.1.0-rc.2 — 2026-07-16

Authorization and contract-parity candidate for final MVP acceptance. It adds the
Cloudflare direct-record route, explicit media-read enforcement, D1/R2 cross-family
negative tests, revoked-membership tests, complete OpenAPI route/security coverage,
and the dated authorization/exposure audit. See the
[curated release notes](0.1.0-rc.2.md), the
[release-gate checklist](../testing/mvp-release-gates.md), and the
[UAT record](../testing/mvp-uat.md).

## 0.1.0-rc.1 — 2026-07-15

Initial ApiaryLens MVP release candidate. See the
[curated release notes](0.1.0-rc.1.md), the
[release-gate checklist](../testing/mvp-release-gates.md), and the
[UAT record](../testing/mvp-uat.md). Stable release notes will list only capabilities
that pass the binding UAT contract.

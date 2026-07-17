# Changelog

## 0.1.0-preview.1 — 2026-07-16

ApiaryLens is now available as Public Preview 1. This is an early, usable product,
not GA or a stable release. It carries forward the verified MVP acceptance candidate
with the installable PWA, family access, synchronized hive history, private media,
portable Cloudflare and Compose deployments, Scout Bee operations, and the public
documentation set.

Features and workflows may change, and preview updates may arrive frequently,
including multiple times per day. Keep current backups and exports, and do not use
ApiaryLens as the sole copy of irreplaceable hive records or media. Physical-device,
assistive-technology, and final owner acceptance gates remain visible in the
[MVP UAT record](../testing/mvp-uat.md).

See the [Preview 1 release notes](0.1.0-preview.1.md) for scope, safety guidance,
verification, and feedback instructions.

### 2026-07-17 Preview updates

- Published the directly installable unsigned Windows Public Preview from source
  `b433d9f`. Exact Windows run `29604870862` passed build, manifest and package
  hashes, packaged-host smoke, clean current-user install, installed-host security
  and health smoke, and keep-data uninstall.
- Completed automatic online synchronization across open, resume, reconnect, and
  connected saves, including complete multi-batch push and paginated pull handling,
  organization-scoped cursors, and protection for unsynchronized/conflicted local
  records.
- Added a protected headless Windows backup/restore boundary with exact compatibility,
  verified recovery backup, staged SQLite integrity checks, session revocation,
  post-restore health verification, and rollback verification.
- Added the standalone/connected Electron Windows host, secret-free deployment
  profile import, verified `.albackup` backup, atomic restore/rollback, and real
  Squirrel current-user Setup/update artifacts. Exact Windows run `29604870862`
  passed package hashes, packaged-host smoke, clean install, installed-host smoke,
  and keep-data uninstall. Production Authenticode signing and physical UAT remain
  release gates.
- Fixed installed-PWA cached launch so local navigation and records render before a
  stalled initial network session refresh. Automatic sync/media and physical
  iPhone/iPad relaunch gates remain visible.
- Published independently versioned Scout Bee `0.1.0-preview.2` for Windows and
  Linux with install/configure/update/repair/rollback/backup/restore/uninstall UI,
  sanitized diagnostics, a release manifest, checksums, SBOM, signing evidence,
  attestations, and a complete public operations guide. Production signing and
  physical released-target lifecycle evidence remain open.

## 0.1.0-rc.7 — 2026-07-16

Corrective safe-target-removal candidate. Exact GCP cleanup proved a normal
administrator could clear the validated target but could not remove its empty
directory from root-owned `/opt`. Scout Bee now deletes contents as the owner and
uses passwordless `sudo rmdir` only for the empty directory, never privileged
recursive deletion. See the [curated release notes](0.1.0-rc.7.md),
[release gates](../testing/mvp-release-gates.md), and
[UAT record](../testing/mvp-uat.md).

## 0.1.0-rc.6 — 2026-07-16

Corrective partial-uninstall recovery candidate. Exact published-byte GCP cleanup
proved that rc.5 could not finish removal from rc.4's partially deleted secret-file
state. Scout Bee now reconstructs only the missing restricted mount points, requires
Compose resource removal to succeed, and then removes the complete validated target.
See the [curated release notes](0.1.0-rc.6.md),
[release gates](../testing/mvp-release-gates.md), and
[UAT record](../testing/mvp-uat.md).

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

# Chocolatey package source — NOT PUSHED (GV4-gated)

Seeded by Phase P2 Track Release-eng (C2) from the DIST-002 research drafts in
`apiarylens-ops` (`design/research/2026-07-18-dist-002-chocolatey-spike.md`).

- **Pushing to the Chocolatey Community Repository is locked until GV4**
  (signed stable artifacts + owner approval). Stable versions only; previews
  and RCs are never submitted.
- The `chocolatey-submission` job in `.github/workflows/release-signing.yml`
  is hard-gated with `if: false` and a `# GV4 gate:` comment.
- `{VERSION}` and `{SHA256_SETUP_X64}` are placeholders substituted by the
  release workflow from the published release `SHA256SUMS` at pack time.
- Automation is first-party `choco pack` + `choco push` only. chocolatey-AU is
  deliberately **not** used: it is GPL-2.0 and exists for third-party
  maintainers scraping vendor sites, neither of which applies here.

Shape: download-at-install of the Squirrel per-user `Setup.exe` from the
official GitHub release asset (checksum-verified), silent install via
Squirrel's `-s` switch. The package installs into the profile of the user
running choco (per-user Squirrel semantics, documented in the nuspec
description) and is not suitable for machine-wide or SYSTEM-context
deployment. `choco uninstall` drives Squirrel's own per-user uninstall entry
and keeps hive data by default (ADR 0016 keep-data rule).

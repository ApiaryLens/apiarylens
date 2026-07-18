# winget manifests — NOT SUBMITTED (GV4-gated)

Seeded by Phase P2 Track Release-eng (C2) from the DIST-001 research drafts in
`apiarylens-ops` (`design/research/2026-07-18-dist-001-winget-spike.md`).

- **Submission to `microsoft/winget-pkgs` is locked until GV4** (signed stable
  artifacts + conformance evidence). Only stable releases are ever submitted;
  previews and RCs stay on direct download + Scout.
- The `winget-submission` job in `.github/workflows/release-signing.yml` is
  hard-gated with `if: false` and a `# GV4 gate:` comment; it cannot run until
  a maintainer deliberately edits the workflow after the owner passes GV4.
- All versions, URLs, SHA-256 hashes, and dates in these manifests are
  **placeholders**; the komac automation rewrites `PackageVersion`,
  `InstallerUrl`, `InstallerSha256`, and `ReleaseDate` from the actual GitHub
  release at submission time.
- The **first** version of `ApiaryLens.ApiaryLens` must be submitted as a
  manual PR to `microsoft/winget-pkgs` — komac can only update an existing
  package.

Shape (schema 1.12.0): `InstallerType: exe` with `Scope: user` — winget has no
native Squirrel installer type, so the Squirrel per-user `Setup.exe` is
declared as `exe` with explicit `--silent` switches (same pattern as
Discord.Discord). `RequireExplicitUpgrade: true` keeps the self-updating app
out of `winget upgrade --all`, and the `--package-manager=winget` custom
switch feeds the R3 dual-updater suppression marker so the in-app Squirrel
updater stands down on winget-owned installs.

# Verify an ApiaryLens Release

Download an artifact from the matching release page, verify its SHA-256 against the
release manifest, and then verify the repository attestation:

```powershell
Get-FileHash .\apiarylens-scout-bee-0.1.0-rc.5-windows-amd64.exe -Algorithm SHA256
gh attestation verify .\apiarylens-scout-bee-0.1.0-rc.5-windows-amd64.exe `
  --repo ApiaryLens/apiarylens `
  --signer-workflow ApiaryLens/apiarylens/.github/workflows/release-signing.yml
```

On Linux or macOS, use `sha256sum` for the first step. Apply the same attestation
command to the Cloudflare and Compose archives, SBOM, license report, and provenance
statement.

For later offline verification, download the attestation and trusted root while
online:

```text
gh attestation download <artifact> --repo ApiaryLens/apiarylens
gh attestation trusted-root > trusted_root.jsonl
```

Then use `gh attestation verify <artifact> --bundle <downloaded.jsonl>
--custom-trusted-root trusted_root.jsonl` on the disconnected system. Verification
must name the official repository and signer workflow; trusting only a checksum or
an attestation from an arbitrary fork is insufficient.

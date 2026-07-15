# ADR 0013: Keyless Release Signing

## Status

Accepted

## Date

2026-07-15

## Acceptance

Accepted under the project owner's delegated MVP implementation authority.

## Context

The MVP requires signed deployment bundles, Scout Bee executables, supply-chain
evidence, and provenance. A long-lived maintainer signing key would require private
key custody, rotation, recovery, and contributor access rules before the project has
that operating infrastructure. It would also make an individual maintainer account
part of the release trust root.

The public source repository and its protected release workflow already provide a
portable public identity. GitHub Actions can obtain a short-lived OIDC identity and
use the Sigstore public-good trust system without a repository signing secret.
GitHub artifact attestations store the signed SLSA provenance against each artifact
digest and can be downloaded for offline verification.

This affects official release publication only. It introduces no runtime,
self-hosting, user account, or cloud dependency into ApiaryLens.

## Decision

Official ApiaryLens release artifacts use keyless GitHub artifact attestations. The
approved signer is the exact workflow identity:

`ApiaryLens/apiarylens/.github/workflows/release-signing.yml`

The workflow:

- runs only in the public `ApiaryLens/apiarylens` repository;
- uses GitHub OIDC with `id-token: write` and no signing secret;
- grants only `contents: read` and `attestations: write` beyond OIDC;
- checks out an immutable revision with persisted credentials disabled;
- validates the release manifest, checksums, SBOM, license report, and existing
  in-toto statement before signing;
- attests every deployment bundle, Scout Bee executable, SBOM, license report, and
  provenance statement by SHA-256 digest; and
- immediately verifies every subject against the repository, exact signer workflow,
  and source ref.

Stable releases run from a protected semantic-version tag. Release candidates may
be attested by an explicitly dispatched run on `main`; their verification must pin
the source ref and recorded workflow run. Consumers verify online with:

```text
gh attestation verify <artifact> \
  --repo ApiaryLens/apiarylens \
  --signer-workflow ApiaryLens/apiarylens/.github/workflows/release-signing.yml
```

They may download the attestation bundle and GitHub/Sigstore trusted root for
offline verification. Release notes record the signing run and verification
commands. A candidate is not promoted to stable when any subject is absent or the
signer workflow, source ref, digest, transparency timestamp, or predicate check
fails.

## Consequences

- ApiaryLens holds no long-lived release signing private key.
- The public repository workflow, rather than a maintainer identity, is the signer.
- Forks can produce their own attestations but cannot satisfy the official
  repository and exact-workflow verification policy.
- Online verification uses GitHub's attestation API; downloadable bundles support
  offline verification after the trusted root has also been saved.
- GitHub and the Sigstore public-good service are release-publication dependencies,
  not product runtime dependencies. A future forge-independent or hardware-backed
  signer requires a superseding ADR and compromise/recovery plan.

## References

- [Versioning, release, and update lifecycle](../architecture/versioning-release-and-update-lifecycle.md)
- [MVP release gates](../testing/mvp-release-gates.md)
- <https://docs.github.com/en/actions/concepts/security/artifact-attestations>
- <https://docs.github.com/en/actions/reference/security/oidc>

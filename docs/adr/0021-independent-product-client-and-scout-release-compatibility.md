# ADR 0021: Independent Product, Client, and Scout Release Compatibility

## Status

Accepted and implemented for Public Preview

## Date

2026-07-17

## Deciders

Kristopher Turner, ApiaryLens project owner. Implementation and Public Preview
publication authorized 2026-07-17.

## Context

ApiaryLens now has several separately installed or deployed things:

- the product backend/web release for Cloudflare or Compose;
- the Windows client, which can bundle a standalone backend or connect remotely;
- later independent native clients;
- Scout Bee, which installs and manages product/client releases; and
- independently evolving API, sync, database, local-store, migration, export, and
  deployment-plan contracts.

Giving every artifact the same version would imply false lockstep and force a Scout
security/UX fix to create a product release. Giving users only unrelated versions
would make compatibility and support incomprehensible. Mutable channel labels or
"latest" cannot establish what is installed or safe to update.

## Decision

Maintain independent semantic versions and release channels for the ApiaryLens
product, each independently distributed client, and Scout Bee. Bind them through a
signed/attested compatibility manifest and exact artifact lock rather than matching
version numbers.

### Version identities

| Identity | Meaning |
|---|---|
| `productVersion` | ApiaryLens backend/web/data-contract release and its exact Cloudflare, Compose, migration, template, and documentation artifacts |
| `windowsClientVersion` | Signed Windows client package, host/bridge, local-store adapter, bundled standalone lock, and client release notes |
| Future client version | Independently shipped iOS/Android or other client artifact and its platform contract |
| `scoutVersion` | Scout Bee UI/executor/lifecycle/package release and self-update identity |
| Contract identifiers | API, sync, database migration head, local-store, migration, export, deployment-plan, diagnostics, and manifest schemas |

Versions may coincide by chance but no equality rule exists. A Scout release is not
named after the product version. Instead, each Scout release declares the product,
client, plan, and manifest ranges it can safely understand and the exact versions
tested in its release evidence.

For standalone Windows, the client release contains an immutable lock selecting the
default bundled product/server version and contracts. The UI presents the Windows
client as the primary application version and exposes the bundled/connected product,
contract, source, channel, and artifact identities in **Version and Build**. It never
hides a mixed or unsupported combination behind one misleading number.

### Compatibility manifest

Every release publishes a canonical, schema-validated manifest containing at least:

- release kind, semantic version, channel, source repository/commit/ref, build time,
  and support status;
- exact artifact names, platforms/architectures, sizes, SHA-256 digests, signatures,
  attestations, SBOMs, provenance, and required notices;
- API, sync, database migration head/history digest, local-store, migration, export,
  deployment-plan, diagnostics, host-bridge, and manifest schema identifiers/ranges;
- minimum/maximum or enumerated compatible product/client/Scout versions where
  semantic contract ranges are insufficient;
- default standalone bundle lock and minimum directly supported upgrade source;
- update/rollback/restore constraints, known irreversible transitions, and required
  backup format;
- stable/Preview/RC eligibility, revoked artifacts, known issues, and documentation
  links; and
- the exact conformance/UAT evidence identity used for promotion.

The manifest contains no secret, private deployment reference, maintainer account,
or mutable credential. Verification pins the expected repository, workflow/signer,
source ref, digest, and attestation identity before compatibility is evaluated.

### Channels and selection

Each release family has `stable`, `preview`, and `rc` channels; development builds
are not an end-user channel. Stable is the default for Scout and product/client
selection. Preview or RC requires an explicit advanced opt-in per release family.
Opting into Preview Scout does not silently opt the product into Preview, and a
stable Scout never silently selects a Preview/RC product.

Channel labels are discovery pointers only. Installation/update records the exact
version and artifact digest. Promotion creates immutable release metadata; it does
not mutate an existing artifact into another channel.

### Update planning

Scout resolves the desired target independently for itself, the client, and the
backend, then computes a compatible sequence:

1. verify current exact identities and pending/recovery state;
2. select only manifests allowed by the operator's channel policy;
3. prove a compatibility path across every intermediate contract/migration state;
4. require Scout self-update first only when the target operation needs a newer
   manifest/plan/executor capability;
5. protect pending client work and create/verify data restore points before mutation;
6. update in the manifest-declared order, health-checking each boundary; and
7. commit exact locks or enter compatible rollback/restore/recovery.

No component updates merely because another shares its version or channel. A client
may update for security/accessibility while remaining compatible with the current
backend. A backend may update only when known clients remain in range or the owner
accepts a clearly described client-upgrade requirement. Scout self-update uses its
own signed lifecycle and rollback state.

### Support and failure behavior

Unsupported combinations fail before download/activation with a plain-language
reason and safe compatible choices. Offline clients remain usable within their
documented local/contract window; pending work is never discarded to force an
update. Revoked or critically vulnerable artifacts receive a prominent notice and
documented deferral/recovery policy without silently mutating a user-controlled
server during active field work.

Rollback is allowed only when code, contract, schema, and data state remain
compatible. Otherwise the lifecycle restores a verified backup or stops for guided
recovery. "Unavailable rollback" is an explicit tested outcome, not a reason to run
an incompatible binary.

## Options considered

### Independent versions plus compatibility manifests — proposed

Supports separate security/UX/release cadences while providing deterministic
selection, support, update order, and user-visible identity.

### One lockstep ApiaryLens version for product, clients, and Scout

Looks simple but creates unrelated releases, couples Scout trust fixes to data
migrations, and obscures what compatibility was actually tested. Rejected.

### Independent versions with a manually maintained compatibility web page

Useful for people but not safe automation, exact artifact resolution, offline
verification, CI, or rollback. Rejected as the authority; generated human pages may
render the canonical manifests.

### Mutable `latest`, `preview`, and `stable` artifacts

Cannot prove installed identity, provenance, reproducibility, downgrade, or rollback
and permits channel retargeting without user evidence. Rejected.

### Let Scout infer compatibility from semantic versions

SemVer alone does not express API/sync/schema/migration/plan or one-way data
transitions. Rejected.

## Consequences

- Users may see multiple versions in diagnostics, but the main UI provides one clear
  client/product status and explains compatibility rather than hiding it.
- Release engineering must publish, sign/attest, validate, archive, and test
  manifests and locks for every release family.
- Scout can patch itself independently and manage multiple supported product
  versions without copying product source.
- Windows can ship a client-only fix or an updated standalone bundle when manifest
  compatibility permits it.
- Support can reproduce an exact client/backend/Scout/contract combination from
  sanitized identity, not private environment details.
- The model scales from one standalone laptop to many client devices and commercial
  deployments because compatibility is per installed component/contract, not a
  presumed single synchronized machine.

## Repository and gallery impact

Each owning public repository publishes its own immutable release manifest,
artifacts, SBOM, provenance, signatures, and notes. Core remains authoritative for
product/contracts/migrations/templates; Scout owns Scout manifests and orchestration;
client ownership follows its accepted repository decision. `my-apiarylens` consumes
locks/manifests in CI and never becomes the compatibility authority.

No community gallery applies to official release identity. Future galleries may
declare compatible product ranges, but they cannot override official manifests,
signers, revocations, or privileged native/deployment code policy.

## Acceptance conditions

This ADR may move to Accepted only after:

1. Versioned JSON schemas and hostile fixtures exist for product, Windows client,
   Scout, compatibility, artifact lock, revocation, and update-plan records.
2. Manifests bind exact artifacts, sizes, checksums, signatures, attestations, SBOM,
   provenance, source identity, contract ranges, upgrade/rollback constraints, and
   documentation with no mutable or secret field.
3. Release discovery proves stable default and independent Preview/RC opt-in; channel
   pointers cannot change an installed exact lock or silently cross channels.
4. Scout resolves compatible fresh install, client-only, backend-only, Scout-first,
   multi-step, downgrade, rollback, restore, and unavailable-rollback plans using
   immutable cached artifacts.
5. Negative tests reject invalid/untrusted manifests, signer/repository mismatch,
   checksum/size mismatch, revoked artifacts, incompatible schemas/contracts,
   skipped migrations, unsupported direct upgrades, and missing rollback.
6. Exact clean Windows, Cloudflare, Compose/Linux, standalone/connected, and
   `my-apiarylens` CI lifecycles prove independent update order, pending-work safety,
   health verification, resume, recovery, and sanitized evidence.
7. `.org`, `.dev`, release notes, changelog, compatibility matrix, update UI,
   diagnostics, support policy, and Scout/client guides render the canonical source
   without divergent manual tables.
8. The independent update-state Lucidchart source/export and owner UAT are current.

## Revisit conditions

Reopen if an independently versioned component is folded into another release,
contracts cannot express a safe compatibility range, repository/signing ownership
changes, or stable support requires a coordinated release train. Preserve exact
identity, independent Scout security updates, migration safety, and documented
compatibility through any change.

## References

- [Versioning, release, and update lifecycle](../architecture/versioning-release-and-update-lifecycle.md)
- [Scout Bee lifecycle design](../deployment/scout-bee.md)
- [Windows-first client and Scout Bee design](../deployment/windows-first-client-and-scout-bee.md)
- [ADR 0013: Keyless release signing](0013-keyless-release-signing.md)
- [ADR 0014: Scout Bee separate repository and release](0014-scout-bee-separate-repository-and-release.md)
- [Independent update-state diagram](../diagrams/windows-scout-architecture.md#page-6--independent-scout-client-and-backend-updates)
- [WIN-008](https://github.com/ApiaryLens/apiarylens/issues/11)

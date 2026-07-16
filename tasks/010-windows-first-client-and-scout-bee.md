# Task 010: Windows-First Client and Scout Bee Platform

## Goal

Deliver the post-Preview Windows-first standalone/connected product direction and
separate Scout Bee lifecycle application described by ADRs 0014 and 0015.

## Required gates

1. Complete the Windows host/package, embedded-service, native-authentication,
   migration, shared-UI, updater, Scout-orchestration, and later mobile-Scout spikes.
2. Accept the follow-on ADRs before framework-dependent implementation.
3. Produce detailed architecture, security, UX, lifecycle, and compatibility designs.
4. Create and catalog authoritative Lucidchart sources and accessible exports.
5. Create/link authoritative GitHub Issues under the platform PMO standard.
6. Implement and test Windows standalone, connected mode, Scout deployment/handoff,
   updates, backup/restore, repair, rollback, and uninstall.
7. Publish and task-test user, operator, developer, troubleshooting, and recovery
   how-to guides on `.org` and `.dev`.
8. Pass exact-artifact clean-profile Windows, Cloudflare, Linux, migration, offline,
   accessibility, security, and recovery UAT.

## Initial implementation boundary

No product code begins during the planning/tracking phase. After explicit owner
authorization, the first code may define secret-free client connection profiles,
standalone/connected mode state, migration readiness rules, and tests. It must not
select a Windows host framework, implement insecure token storage, or claim an
installer exists before the research and ADR gates pass.

## References

- [ADR 0014](../docs/adr/0014-scout-bee-separate-repository-and-release.md)
- [ADR 0015](../docs/adr/0015-windows-first-client-portfolio.md)
- [Detailed deployment design](../docs/deployment/windows-first-client-and-scout-bee.md)

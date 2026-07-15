# Task 006: Research the Near-Free Family Cloud Profile

## Goal

Validate and specify the accepted Cloudflare-first family cloud deployment for a
family using ApiaryLens from iPhones, iPads, and computers at zero or predictably
near-zero recurring cost. Define Docker Compose on an ordinary Linux VM as the
second cloud target and portable fallback.

## Reference Workload

Define and justify a family workload before comparing providers, including:

- Two to five family members
- Small and medium hive counts
- Inspection frequency
- Photo and optional video use
- Backup retention
- Offline synchronization patterns
- Idle periods and seasonal activity

## Options to Evaluate

- The primary candidate: a Cloudflare-native application backend using Workers,
  D1, R2, or related services; public frontend hosting is already accepted
- The required fallback: Docker Compose on a provider-neutral Linux VM
- Relevant Azure, AWS, and Google Cloud low-cost or free allowances
- Managed database and object-storage combinations
- User-owned deployment versus a future managed ApiaryLens service

## Required Analysis

- First-run account and deployment complexity
- Monthly idle and active cost
- Hard limits and behavior when limits are reached
- Data durability, backups, restore, and export
- PWA and synchronization compatibility
- Required architectural differences from the portable core
- Provider lock-in and migration path
- Identity and family sharing
- Logging, monitoring, and support burden
- Security and privacy
- Cost controls and surprise-billing prevention

## Outputs

- Research report with dated primary sources and measured tests
- Cost table for the reference workload
- Validated Cloudflare family profile or evidence that an acceptance gate failed
- Supported Compose-on-VM fallback and migration path
- Required ADRs
- Lucid deployment and data-flow diagrams
- Reproducible deployment-plan JSON example with no secrets

Cloudflare's implementation priority is accepted by
[ADR 0007](../docs/adr/0007-deployment-profile-priority.md). Do not declare the
profile supported solely because its current free tier appears sufficient; if it
fails an acceptance gate, document the evidence and use the Compose-on-VM fallback
without weakening the family-cloud outcome.

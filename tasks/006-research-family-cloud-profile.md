# Task 006: Research the Near-Free Family Cloud Profile

## Goal

Recommend a supported, always-available cloud deployment for a family using
ApiaryLens from iPhones, iPads, and computers at zero or predictably near-zero
recurring cost.

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

- A Cloudflare-native application backend using Workers, D1, R2, or related
  services; public frontend hosting is already accepted and is not the decision here
- A provider-neutral container or VM profile
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
- Recommended family cloud profile and fallback
- Required ADRs
- Lucid deployment and data-flow diagrams
- Reproducible deployment-plan JSON example with no secrets

Do not select a provider solely because its current free tier appears sufficient.

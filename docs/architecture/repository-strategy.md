# Repository Strategy

## Current Local Layout

GitHub org folder:

```text
D:\git\apiarylens
```

Main repo:

```text
D:\git\apiarylens\apiarylens
```

## Initial Repository

Start with one base monorepo:

```text
ApiaryLens/apiarylens
```

## Why One Repo First

Starting with one repo keeps the project simpler while requirements, docs, API, database model, frontend, backend, and tasks are still being defined.

Do not create many repos until there is operational need.

## Initial Monorepo Structure

```text
apiarylens/
├── .github/
├── apps/
│   ├── web/
│   ├── api/
│   ├── worker/
│   └── mobile/
├── packages/
│   ├── ui/
│   ├── shared/
│   ├── database/
│   ├── api-client/
│   └── config/
├── docs/
├── tasks/
├── prompts/
├── docker/
├── scripts/
├── AGENTS.md
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
└── CODE_OF_CONDUCT.md
```

## Later Repos

Possible future repos:

- .github
- apiarylens.org
- apiarylens.dev
- apiarylens-plugins
- apiarylens-sensor-firmware
- apiarylens-helm-charts
- apiarylens-cloud

Do not create these until needed.

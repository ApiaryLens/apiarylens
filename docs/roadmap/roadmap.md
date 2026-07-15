# ApiaryLens Roadmap

## MVP Target

The initial go-to-market user is a family or hobbyist beekeeper. The default journey
must be easy to start, update, back up, restore, and understand without requiring
container, database, DNS, TLS, identity-provider, or cloud-billing expertise.

ApiaryLens is designed in capability tiers: personal, family, and organization.
Commercial and research scale remains on the roadmap, but it must not make the MVP
experience heavier.

## Phase 0: Project Foundation

- GitHub org setup
- Activate and clone the six-repository portfolio
- Responsibility-specific repository scaffolds and cross-repository governance
- Domain strategy
- Monorepo setup
- README
- AGENTS.md
- License decision
- Contribution docs
- Security docs
- Initial security architecture, risk register, and exposure-mode rules
- Product brief
- Architecture plan
- Roadmap
- ADR process
- Task backlog
- Dedicated Lucid `ApiaryLens` folder and diagram catalog
- Public/private architecture boundary
- Public brand brief, visual identity, asset license, and provenance workflow
- Optional Studio Foundry production workflow for approved pre-rendered assets
- Cloudflare Workers Static Assets convention for `.org`, `.app`, and `.dev`
- Cloudflare custom-domain, TLS, preview, production, and rollback foundation

## Phase 1: MVP Foundation

- Device-only, networked, and internet-facing security profiles
- Built-in family authentication, secure sessions, bootstrap, and recovery
- Optional OIDC architecture and interoperability baseline
- Authorization and organization-isolation test foundation
- Threat model and applicable OWASP ASVS verification matrix
- Secret, dependency, static-analysis, and container scanning
- Release SBOM, checksums, signing, and provenance
- Organizations
- Users
- Roles
- Apiaries
- Hives
- Basic PWA shell
- Approved PWA icons, application marks, and accessible brand assets
- Device-local personal-mode research and prototype
- Guided personal onboarding
- Backup, restore, and export foundation
- Backend API
- PostgreSQL schema
- Offline synchronization foundation
- Basic family membership and multi-device access
- Docker Compose
- Versioned deployment-plan schema
- `Scout Bee` guided-deployment research and prototype
- Safe public demo
- Near-free, always-available family cloud reference research
- iPhone, iPad, and desktop PWA compatibility testing
- Deployment, upgrade, backup, restore, and cost acceptance suite

## Phase 2: Hive Records

- Inspections
- Queen tracking
- Box tracking
- Frame tracking
- Photos
- Videos
- Notes
- Tags
- QR codes

## Phase 3: Health and Production

- Varroa mite counts
- Disease/pest observations
- Treatments
- Feeding
- Honey harvest
- Wax harvest
- Reports

## Phase 4: Weather and Bloom Intelligence

- Forecast weather
- Historical weather
- Weather pattern tracking
- Frost dates
- Rainfall
- Growing degree days
- Bloom calendar
- Forage plant database

## Phase 5: Advanced Sharing and Club Mode

- Mentor sharing
- Family sharing
- Bee club organizations
- Read-only links
- Shared inspections
- Exportable reports
- Organization OIDC administration and advanced identity federation

## Phase 6: AI Assistance

- AI photo observations
- AI inspection summaries
- AI seasonal recommendations
- AI risk flags
- AI provider abstraction
- Local model option

## Phase 7: Native Mobile

- Downloadable iPhone application distributed through the Apple App Store
- Connection to self-hosted, family-cloud, and future managed ApiaryLens deployments
- Shared public authentication, API, synchronization, media, and portability contracts
- Guided server URL, QR code, or connection-file onboarding
- Capacitor, alternate wrapper, or native implementation research and ADR
- iPad experience based on the shared Apple client where practical
- Android app
- Native signing, packaging, privacy, and release pipeline
- Push notifications
- Camera integration
- Offline sync improvements

Dependencies:

- Mature PWA mobile workflows
- Stable versioned API and synchronization protocol
- Authentication and deployment-connection contracts
- Supported HTTPS and trust guidance for self-hosted deployments
- Apple developer account, private signing assets, and App Store release operations

## Phase 8: Sensors and Integrations

- Hive scales
- Temperature sensors
- Humidity sensors
- MQTT
- LoRaWAN
- Home Assistant integration
- Weather stations

## Phase 9: Commercial / Research Scale

- Route planning
- Large apiary support
- Employee roles
- Pollination contracts
- Research mode
- Advanced exports
- SaaS option

Commercial scale extends the same organization, membership, API, data, and
deployment contracts. It must not require a separate product edition or migration
away from portable ApiaryLens data.

## Cross-Cutting: Community Galleries and Registries

Future phases may introduce reusable community assets such as templates, regional
datasets, equipment profiles, adapters, integrations, or plugins. Each relevant
feature must evaluate gallery and registry implications using
[`../architecture/community-galleries-and-registries.md`](../architecture/community-galleries-and-registries.md).
This consideration does not commit the project to a centralized registry,
marketplace, separate repository, or delivery phase.

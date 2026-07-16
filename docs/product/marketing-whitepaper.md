# ApiaryLens Product Overview and Capability Whitepaper

**Status:** Public Preview 1 product narrative. For the concise audience-facing
version, see the [Marketing Overview](marketing-overview.md).

## What is ApiaryLens?

ApiaryLens is an open-source apiary intelligence platform for beekeepers. Public
Preview 1 tracks apiaries, hives, queens,
equipment, inspections, health observations, photos, mite counts, feeding,
treatments, harvests, follow-ups, and long-term hive history. It is licensed under
Apache License 2.0 and is not GA or a stable release. Features and workflows may
change as Preview updates arrive, sometimes multiple times per day.

Keep backups current during Preview 1; do not make ApiaryLens the sole copy of
irreplaceable hive records or media.

ApiaryLens is designed to be simple enough for a family getting its first hive and powerful enough to grow into bee club, research, and commercial use.

## Why It Exists

New beekeepers need more than a notebook. They need a way to remember what happened in each hive, understand seasonal tasks, track queen performance, watch for health issues, and learn from mentors.

ApiaryLens turns hive records into a living history.

## Who It Is For

- New beekeepers
- Families
- Bee clubs
- Mentors
- Commercial apiaries
- Extension offices
- Educators
- Researchers

## Current Product

The first usable Public Preview focuses on practical family and hobbyist hive
management.
The accepted [MVP Definition and UAT Contract](mvp-definition.md) establishes the
exact release boundary; the broader capabilities below include post-MVP roadmap
direction and are not all launch requirements.

Current MVP capability surface:

- Multi-apiary tracking
- Multi-hive tracking
- Hive equipment tracking
- Box and frame records
- Queen tracking
- Inspection logging
- Private original photos and thumbnails
- Hive health observations
- Varroa mite tracking
- Feeding records
- Treatment records
- Honey harvest records
- Manual weather snapshots
- Sharing with family or mentors
- PWA support
- Offline-first design
- Docker self-hosted deployment
- REST API
- Guided installation, backup, restore, updates, and data export
- Authenticated family synchronization across phones, tablets, and computers
- Safe public synthetic demo

Weather history, regional bloom intelligence, video, QR workflows, and native mobile
clients remain in the broader roadmap rather than the MVP acceptance boundary.

## Future Capabilities

ApiaryLens should grow into a full apiary intelligence platform.

Future features:

- AI photo review
- AI inspection summaries
- Brood pattern analysis
- Queen detection
- Swarm risk flags
- Honey flow forecasting
- Native iOS and Android apps
- Bee club mode
- Research mode
- Optional community galleries or registries if later justified; no marketplace is committed
- Home Assistant integration
- Hive scales and sensors
- Route planning
- Commercial reporting
- Optional hosted SaaS

## Photos and Video Almanac

ApiaryLens should preserve the visual story of each hive.

A beekeeper should be able to look back over time and see:

- What the brood looked like
- How the queen performed
- When pests appeared
- How honey stores changed
- What the entrance looked like
- How the hive responded through seasons

This creates a practical photo and video almanac for each hive.

## Weather and Bloom Intelligence

ApiaryLens should connect hive performance to the local environment.

The system should track:

- Historical weather
- Rainfall
- Heat and cold events
- Frost dates
- Bloom timing
- Nectar and pollen sources
- Weather impact on inspections
- Weather impact on honey production

## Open Source and Self-Hosted

ApiaryLens should be free or as close to free as possible for families and bee clubs.

Core principles:

- No required paid cloud account
- No required AI subscription
- Runs locally or on a small server
- Docker Compose deployment
- User owns the data
- Exportable data

## Future SaaS Possibility

ApiaryLens is not SaaS at launch.

But the architecture should allow a future hosted version for users who want easy onboarding and do not want to self-host.

The open-source project remains first-class even if a hosted version exists later.

## Public Web Experience

- `apiarylens.org` is the project, learning, documentation, release, and community home.
- `apiarylens.app` is the hosted PWA and safe public demo, with optional SaaS later.
- `apiarylens.dev` is the developer, API, integration, SDK, and contributor portal.
- `apiarylens.com` redirects to `.org` while reserved for future commercial use.

All official public frontends are hosted on Cloudflare. The open-source server and
self-hosted deployment remain portable and do not require Cloudflare.

## Brand Positioning

ApiaryLens means seeing the hive clearly.

Possible tagline:

> ApiaryLens: Open-source insight for every hive.

Alternative tagline:

> ApiaryLens: See every hive. Understand every colony.

# ApiaryLens Product Overview and Capability Whitepaper

**Status:** Pre-release product narrative. For the concise audience-facing version,
see the [Marketing Overview](marketing-overview.md).

## What is ApiaryLens?

ApiaryLens is a planned open-source apiary intelligence platform for beekeepers. It
is being designed to track hives, queens, inspections, hive health, photos, weather,
blooms, honey production, and long-term colony history. No application has been
released yet, and the formal open-source license still requires a project decision.

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

## Initial Product Direction

The first usable releases focus on practical family and hobbyist hive management.
Discovery and architecture decisions will establish the final MVP boundary rather
than treating every long-term capability as a launch requirement.

Current capability direction:

- Multi-apiary tracking
- Multi-hive tracking
- Hive equipment tracking
- Box and frame records
- Queen tracking
- Inspection logging
- Photos and videos
- Hive health observations
- Varroa mite tracking
- Feeding records
- Treatment records
- Honey harvest records
- Weather history
- Bloom calendar foundation
- QR codes
- Sharing with family or mentors
- PWA support
- Offline-first design
- Docker self-hosted deployment
- REST API
- Guided installation, backup, restore, updates, and data export
- Authenticated family synchronization across phones, tablets, and computers
- Safe public demo

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

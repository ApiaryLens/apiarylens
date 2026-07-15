# ApiaryLens Feature Inventory

This file captures the product requirements discussed in the chat.

This is a full roadmap inventory, not the MVP scope. The proposed authoritative MVP
boundary is [ApiaryLens MVP Definition and UAT Contract](../product/mvp-definition.md).
Items listed here do not become MVP requirements unless that document includes them
as P0.

## Core Product Areas

- Multi-apiary management
- Multi-hive management
- Hive equipment modeling
- Box tracking
- Frame tracking
- Queen tracking
- Inspection logging
- Health tracking
- Varroa mite tracking
- Disease and pest observations
- Feeding records
- Treatment records
- Honey production
- Wax production
- Swarms
- Splits
- Queen rearing
- Photos and videos
- Visual hive almanac
- Weather forecast
- Weather history
- Weather pattern tracking
- Bloom calendar
- Forage plant database
- Extension office resources
- Sharing and mentor mode
- Bee club mode
- Reporting
- Inventory
- Financials
- Maps
- Sensors
- AI assistance
- Public API
- Plugin system
- Home Assistant integration
- Downloadable iPhone App Store client that connects to the user's chosen deployment
- Future iPad and Android clients
- Research mode
- Future SaaS option

## Apiaries

Track:

- Name
- GPS coordinates
- Address
- Elevation
- USDA hardiness zone
- Climate region
- Landowner
- Access notes
- Water sources
- Shade
- Wind exposure
- Hive capacity
- Photos
- Map/satellite view

## Hives

Track:

- Permanent hive ID
- Name/number
- Apiary
- Install date
- Origin: package, nuc, split, swarm, purchased colony
- Status
- Current queen
- Population strength
- Equipment stack
- QR code
- Photos
- Notes

## Equipment

Supported hive types:

- Langstroth
- Top Bar
- Warre
- Layens
- Flow Hive
- Nuc
- Observation Hive
- Custom

Langstroth sizes:

- Deep
- Medium
- Shallow
- 8-frame
- 10-frame
- 5-frame nuc

Components:

- Bottom board
- Screened bottom board
- Solid bottom board
- Brood boxes
- Honey supers
- Frames
- Feeders
- Queen excluders
- Inner cover
- Outer cover
- Entrance reducer
- Mouse guard

## Frames

Track:

- Frame ID
- Box position
- Foundation type
- Comb age
- Brood percentage
- Honey percentage
- Pollen percentage
- Empty percentage
- Drone comb
- Queen cells
- Photo history
- Rotation history

## Queens

Track:

- Queen ID
- Photo
- Marked yes/no
- Mark color/year
- Breed/line
- Source/breeder
- Purchase date
- Introduction date
- Acceptance
- Mother queen
- Daughter queens
- Drone lineage if known
- Performance score
- Temperament
- Brood pattern
- Swarm/supersedure history
- Current status: alive, missing, superseded, removed, dead

## Inspections

Track:

- Date/time
- Inspector
- Weather
- Temperature
- Wind
- Humidity
- Hive temperament
- Queen seen
- Eggs present
- Larvae present
- Capped brood
- Brood pattern
- Population estimate
- Frames of bees
- Honey stores
- Pollen stores
- Queen cells
- Swarm cells
- Supersedure cells
- Robbing
- Bearding
- Ventilation
- Space/congestion
- Odor
- Notes
- Photos/videos
- Follow-up tasks

## Health and Pests

Track:

- Varroa mite counts
- Alcohol wash
- Sugar roll
- Sticky board
- Treatment threshold
- Nosema
- European Foulbrood
- American Foulbrood
- Chalkbrood
- Sacbrood
- Deformed Wing Virus
- Small Hive Beetle
- Wax Moths
- Tracheal Mites
- Queen problems
- Laying workers
- Drone layer
- Chronic Bee Paralysis

AI must never provide final disease diagnosis. It can flag observations for human review.

## Treatments

Track:

- Product
- Treatment type
- Dosage
- Lot number
- Expiration date
- Application date
- Removal date
- Temperature restrictions
- Honey super restrictions
- Withdrawal period
- Effectiveness
- Follow-up reminder

## Feeding

Track:

- Syrup 1:1
- Syrup 2:1
- Fondant
- Dry sugar
- Protein patty
- Pollen patty
- Amount
- Date
- Consumption
- Reason

## Production

Track:

- Honey harvest
- Supers pulled
- Frames harvested
- Weight
- Moisture percentage
- Color
- Flavor notes
- Batch ID
- Jar count
- Sold/gifted/personal use
- Wax rendered
- Products made from wax

## Weather and Bloom Intelligence

Track:

- Forecast weather
- Historical weather
- Daily high/low
- Rainfall
- Humidity
- Wind
- Frost dates
- Growing degree days
- Drought
- Storms
- Heat waves
- Cold snaps
- Bloom timing
- Inspections blocked by weather
- Honey flow vs weather
- Winter consumption vs temperature

Bloom data:

- Plant common name
- Scientific name
- Bloom start
- Bloom end
- Nectar rating
- Pollen rating
- Native/invasive
- Honey color/flavor
- USDA zones
- Region
- Community contributed bloom records

## Sharing

Sharing levels:

- Private
- Family
- Mentor
- Bee club
- Public read-only report

Shareable items:

- Apiary
- Hive
- Inspection
- Queen history
- Mite report
- Photos/videos
- Harvest report
- Full apiary report

## Authentication

Use the exposure-based security model defined in
[`../security/authentication-and-sharing.md`](../security/authentication-and-sharing.md):

- Password-optional device-only profile that cannot be reached from another device
- Mandatory built-in accounts for family, LAN, tunnel, VPN, and cloud deployments
- Secure sessions, bootstrap, recovery, invitations, and audit events
- Optional OIDC federation for organization deployments
- Native-client Authorization Code with PKCE contract later

Roles:

- Owner
- Admin
- Apiary Manager
- Inspector
- Mentor
- Read-only Viewer
- Club Member

## AI Features

- AI photo observations
- AI brood pattern review
- AI queen detection
- AI pest/disease flags
- AI inspection summaries
- AI swarm risk suggestions
- AI honey flow forecasting
- AI seasonal recommendations
- Provider abstraction: OpenAI, Anthropic, local model, disabled

## Future Integrations

- Home Assistant
- MQTT
- LoRaWAN
- Bluetooth hive scales
- Weather stations
- Temperature sensors
- Humidity sensors
- CO2 sensors
- Acoustic monitoring
- API clients
- Optional community gallery or registry if later justified; a commercial
  marketplace requires a separate decision

## Community Galleries and Registries

Some future features may produce reusable community assets, including templates,
regional datasets, equipment profiles, adapters, integrations, and plugins. These
possibilities must be evaluated using
[`community-galleries-and-registries.md`](community-galleries-and-registries.md).
They are not automatically committed features, repositories, or centralized
services.

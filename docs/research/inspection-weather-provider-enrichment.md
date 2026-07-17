# Inspection weather provider-enrichment research

## Decision boundary

ApiaryLens Public Preview records a manual weather snapshot directly in an
inspection. Temperature, conditions, humidity, wind speed, unit, and direction are
available offline. Manual entry is the default and requires no provider, account,
location permission, or network connection.

Automatic current or historical enrichment is not enabled by default. Adding it
requires an ADR because it introduces location disclosure, a changing third-party
contract, attribution and licensing duties, rate limits, availability behavior, and
potential operating cost.

## Required consent flow

Any future provider integration must:

1. start only after the user selects **Get weather for this inspection**;
2. explain which coordinates, apiary identifier (if any), inspection time, and
   network address leave the user's deployment;
3. request browser/device location separately when an apiary has no saved location;
4. show the provider, observation/model time, units, and attribution before the user
   accepts the snapshot;
5. save an ordinary snapshot so the inspection remains complete and readable
   offline when the provider is later unavailable;
6. permit correction or replacement with manual values;
7. avoid sending hive observations, family identity, notes, photos, or credentials;
8. support a self-hosted adapter or a fully disabled state without degrading manual
   inspection entry.

Historical lookup must use the inspection's time rather than the current time. The
client must never silently infer that current conditions describe an earlier
inspection. Provider data is advisory context, not evidence that replaces the
beekeeper's observation.

## Follow-on ADR questions

- provider-neutral server adapter versus direct client request;
- coordinate precision and retention minimization;
- attribution and redistribution terms for exported snapshots;
- caching and rate-limit behavior across Cloudflare, Compose, and standalone
  Windows profiles;
- historical-data availability and unit normalization;
- explicit opt-in storage at user, family, and one-time request scopes;
- error, timeout, offline, and provider-retirement behavior.

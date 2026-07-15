# Cloudflare Family Cost and Observation Evidence

**Release:** 0.1.0-rc.1  
**Production deployment:** 2026-07-15 20:00:36 UTC  
**Observation capture:** 2026-07-15 20:42 UTC  
**Provider region reported by D1:** ENAM

## Result

The production family profile remained on release identity
`ApiaryLens@0.1.0-rc.1+037d548` and migration `0004` for more than 41 minutes after
deployment. The observation window therefore exceeds the 15-minute release gate.
This is a quiet release-candidate baseline, not a completed month-long family load
test or a permanent-free claim.

| Meter | Observed use |
|---|---:|
| Worker dynamic requests | 3 successful, 0 errors, 0 subrequests |
| D1 queries | 42 reads; 19 writes |
| D1 rows | 245 read; 57 written |
| D1 database storage | 147,456 bytes (144 KiB), 13 tables |
| Production R2 media | 0 objects; 0 bytes |
| Isolated UAT R2 media | 2 private recovery-test objects; 72 bytes |

The production Worker version was
`6496d906-79fe-4bca-aa4f-0fcda1f0e6a6`. Worker Analytics, D1 Analytics and
`wrangler d1 info` supplied the request/database measurements; the R2 object API
supplied the object totals.

## Dated provider allowances

These are Cloudflare's published allowances checked on 2026-07-15. They can change.

| Service | Free allowance used by the guarded family profile | Paid Standard reference |
|---|---|---|
| Workers | 100,000 dynamic requests/day; 10 ms CPU/invocation; static asset requests are free and unlimited | $5/month minimum; 10 million requests/month included, then $0.30/million |
| D1 | 5 million rows read/day; 100,000 rows written/day; 5 GB total storage | 25 billion rows read/month, 50 million written/month and 5 GB included, then metered overage |
| R2 Standard | 10 GB-month storage; 1 million Class A and 10 million Class B operations/month; internet egress free | $0.015/GB-month, $4.50/million Class A and $0.36/million Class B beyond allowance |

Primary references:

- <https://developers.cloudflare.com/workers/platform/pricing/>
- <https://developers.cloudflare.com/d1/platform/pricing/>
- <https://developers.cloudflare.com/r2/pricing/>

Workers and D1 free-limit exhaustion can reject additional work until the allowance
resets. R2 Standard is usage-priced beyond its included allowance. Scout Bee does
not enable a paid plan and now requires the operator to acknowledge these dated
terms before Cloudflare preflight or apply.

## Family planning scenarios

These deliberately conservative scenarios are planning inputs, not measurements or
billing guarantees. “Reads” and “writes” mean D1 rows, not API calls.

| Scenario | Members | Dynamic requests/day | D1 rows read/day | D1 rows written/day | Media stored |
|---|---:|---:|---:|---:|---:|
| Small family apiary | 2 | 500 | 5,000 | 500 | 1 GB |
| Active family apiary | 5 | 5,000 | 100,000 | 5,000 | 5 GB |
| Photo-heavy family apiary | 5 | 20,000 | 1,000,000 | 20,000 | 9 GB |

All three fit inside the allowances published on the capture date. Actual photo
size, thumbnailing, device synchronization, export/restore activity, and retention
determine real usage. The operator should review Cloudflare Analytics after the
first week and month and before adding substantially more media or members.

Excluded costs include domain registration, an optional Cloudflare paid plan,
off-account backup storage, internet access, devices, and any operator-selected VM.
The Compose profile remains the no-provider-account, personally controlled
self-hosting path.

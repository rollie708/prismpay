# Delivery evidence and final readiness checklist

## Current verdict

**Not ready to claim a production commerce launch.** Application code is implemented and local checks pass. Hosting, production database, OIDC, payment services, merchants, domain/TLS, monitoring and backups are unconfigured/unverified in this workspace. On-chain commerce is not implemented. No successful real-money or chain transaction has been claimed.

The production schedule is fixed at `2026-10-21T15:00:00Z`. Work started after that time according to the machine clock. There was no opportunity to deploy or test this implementation before the requested deadline.

## Local checks completed

Command: `npm test` — **10 tests passed, 0 failed**.

| Test | Evidence |
|---|---|
| Exact UTC boundary | PRE_LAUNCH one millisecond before, LIVE at/after; maintenance precedence; production timestamp override rejection |
| Direct server gate | Application and API locked before launch, allowed after on the same running app; forged client date ignored |
| Cache and source exposure | No-store status; private HTML, source and `.env` unavailable through HTTP |
| Dependency failures | Missing/failed DB returns unavailable, commerce routes fail closed, no secret error detail |
| Catalog and authorization | Empty DB, merchant verification, publication validation, price validation, search, archive, role denial, CSRF/origin denial and audit |
| Disabled payments | Arbitrary hashes/paid flags cannot create an order; methods explicitly unavailable |
| Trusted verification | Pending payment creates no order; wrong amount, currency, reference, user, live mode and intent status rejected; replay creates one order |
| Order privacy and fulfillment | Anonymous blocked, second user cannot read order, ordinary user cannot fulfill, repeated fulfillment records once |
| Checkout idempotency | Repeat key reuses checkout; price snapshot retained; conflicting product rejected; no order before verification |
| Webhook/rate limit | Forged signature rejected; account mutation throttled |
| Browser test (included in 10 tests) | Shortened test-server launch setting, open-tab automatic application transition, browser `Date.now()` moved to 2099 without bypass, catalog search, account empty state, maintenance screen |
| Responsive test | Chromium at 1440×1000, 768×1024, 390×844; no horizontal overflow; desktop/mobile screenshots visually inspected |

`npm run build` — passed. `npm install` dependency audit at installation — 0 reported vulnerabilities. This is not a security audit.

Database tests use **PGlite**, not a deployed managed PostgreSQL service. Identity is injected by tests directly into the server factory; no request/environment bypass is enabled in the deployed entrypoints. Payment objects are test doubles, not real provider transactions. These tests establish implementation behavior, not integration readiness.

Generated screenshots: `test-results/commerce-1440.png`, `commerce-768.png`, `commerce-390.png` (ignored build artifacts). The catalog is intentionally empty in these screenshots.

## Implemented but externally unverified

- [ ] Vercel preview build, function bundling and catch-all route behavior on the actual project.
- [ ] Migrations against managed PostgreSQL, TLS verification, role grants, pooler/transaction behavior and backups.
- [ ] Actual OIDC discovery, signup/login/callback, verified-email enforcement, recovery delivery, logout and session expiry.
- [ ] Provider-enabled checkout, sandbox/live payments, signed webhook delivery and outage/retry recovery.
- [ ] Production domain and TLS, canonical redirects, no CDN caching across launch boundary.
- [ ] Production logging, alerts, external uptime checks and incident ownership.
- [ ] Independent security review/audit if required by the owner.

## Not implemented / unavailable

- Robinhood Chain RPC transaction flow, wallet connection, native/token transfers, confirmation rules and explorer links.
- Official token publication, balances, supply/tokenomics, token utility and token checkout.
- Automated digital delivery, shipping, smart-contract redemption, refunds, tax calculation, subscriptions and merchant split settlements.
- Automated payment reconciliation worker (webhook redelivery and authenticated explicit verification are implemented).
- Original uploaded brand-image integration: file not found in the existing project; original SVG geometry preserved.

## Final pre-launch / go-live checklist

### Ownership and infrastructure
- [x] Inspect original Paynexis files and preserve its existing logo/community links/deployment target.
- [x] Back up original project before changes; checksum recorded in README.
- [x] Remove fake balances/orders, inactive waitlist success endpoint and unverified token utility claims.
- [ ] Supply the original brand image if required for final brand approval.
- [ ] Link and deploy to the existing Paynexis hosting project/domain.
- [ ] Configure all required environment variables and secret storage.
- [ ] Provision production database, apply migrations and verify rollback/restore.
- [ ] Enable database backups, alerts and retention policies.

### Access and product
- [x] Implement server-side launch gate and maintenance override.
- [x] Lock direct product routes and APIs before launch.
- [x] Implement no-cache status and automatic open-tab transition.
- [x] Implement administrator authorization, validated catalog edits and private orders.
- [ ] Configure identity provider and verify real recovery/session flows.
- [ ] Bootstrap operator and verify customer/admin separation in production.
- [ ] Verify and onboard actual merchants; publish only real fulfillable products.
- [ ] Finalize customer terms, support, privacy/retention and merchant fulfillment processes.

### Transactions and release
- [x] Keep unconfigured payments and unverified token/network capabilities disabled.
- [x] Implement trusted card-payment adapter, idempotency and manual fulfillment records.
- [ ] Complete real provider sandbox and authorized production payment tests before enabling checkout.
- [ ] If on-chain checkout is required for launch, implement and test the missing network adapter using verified configuration first.
- [ ] Run staging transition rehearsal through real hosting/CDN with a future staging timestamp.
- [ ] Validate production domain/TLS, API gating, logs, mobile views and service status.
- [ ] Confirm the production timestamp remains `2026-10-21T15:00:00Z`.
- [ ] Record deployment URL, migration version, acceptance results, responsible operator and backup restore evidence.

Nothing needs to be manually toggled at the scheduled timestamp once the configured services have been deployed. These unchecked items cannot be completed by a countdown and are not implied by the LIVE schedule state.

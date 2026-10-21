# Paynexis — Commerce, Powered On-Chain

The existing Paynexis project, upgraded in place from a static launch page to a server-gated commerce application. The geometric logo, black/silver identity, whitepaper URL, Telegram community and Vercel deployment target are preserved.

## Actual delivery status

**Code implemented and locally tested. Not deployed or production-ready without external configuration.** No production database, identity provider, payment credentials, hosting/project connection, domain, verified merchant catalog or Robinhood Chain integration was present in the original directory. No production deployment or payment was performed.

The requested launch timestamp remains **`2026-10-21T15:00:00Z`**. Inspection occurred after that deadline (machine UTC was `2026-10-21T19:26:26Z`). This work cannot establish a deployment before an already elapsed deadline. When deployed after that time, the schedule state is LIVE, unless an administrator has enabled maintenance. Commerce still fails closed when the database is unavailable.

## Run locally

Requires Node.js 22+ and PostgreSQL for commerce. Without configured services the public page works and reports unavailable commerce honestly.

```powershell
npm ci
Copy-Item .env.example .env
# Supply your database and other configuration in .env.
npm run migrate
npm run dev
```

Open `http://localhost:8000`. A static file server is no longer a supported deployment; it cannot enforce the launch gate.

```powershell
npx playwright install chromium
npm test
npm run build
```

Tests use isolated in-memory PostgreSQL-compatible PGlite databases and test-only identities/payment responses. They never populate the live catalog or modify the production launch variable. Chromium is needed for the browser test.

## Implemented features

| Area | Code provided | Current external status |
|---|---|---|
| Launch | Canonical UTC configuration, PRE_LAUNCH/LIVE/MAINTENANCE, no-cache status API, server route/API gates, monotonic countdown, bounded client polling | Local tests passed; production not deployed |
| Brand/UI | Responsive commerce shell, existing logo, dark metallic panels, homepage, documentation | Original uploaded image was not in this directory; preserved existing SVG identity |
| Catalog | PostgreSQL listings, search/type filtering, details, pagination, merchant eligibility, admin create/edit/publish/archive | Database and verified listings required |
| Accounts | OIDC authorization-code + PKCE + state + nonce, verified email, server sessions, profile update, logout, ownership checks | Provider, SMTP/recovery configuration and production login testing required |
| Checkout | Optional Stripe hosted card checkout, frozen price snapshot, idempotency keys, verified webhooks and explicit reconciliation | Disabled; credentials, business setup and real provider acceptance tests required |
| Orders | Created only after trusted payment verification, private history, printable purchase receipts | No real orders generated |
| Fulfillment | Manual delivery confirmation, customer-visible note, one fulfillment event per order, transactional audit | Actual merchant delivery process required |
| Admin | Role-protected catalog, merchants, orders, readiness, maintenance, private token metadata, audit records | Bootstrap an authenticated operator after provider setup |
| Network/token | Honest disabled state; private metadata fields and network readiness indicators | No wallet connection, RPC adapter, balances, token checkout, contracts or token benefits implemented |

Automatic downloads, shipping, smart-contract redemption, refunds, tax automation and subscriptions are not implemented. Do not list goods requiring these workflows. Card payments are an optional additional payment rail, not an on-chain integration.

## Source map

- `server/app.js`: HTTP routes, server enforcement, authorization, security headers and error handling.
- `server/config.js`: canonical launch timestamp and state calculation.
- `server/auth.js`: OIDC and PostgreSQL-backed sessions.
- `server/payments.js`: trusted Stripe verification and idempotent checkout/order creation.
- `server/validation.js`: server input schemas.
- `migrations/001_commerce.sql`: users/roles, merchants, catalog, attempts, orders, fulfillment, configuration, audit, sessions and rate limits.
- `index.html`, `script.js`: public launch/status experience.
- `views/app.html`, `app.js`, `product.css`: protected application shell and interface.
- `website.css`: refreshed Paynexis website design shared by the public page and application, with metallic brand artwork, responsive navigation and product/service discovery shortcuts. Existing backend workflows and routes are retained.
- `whitepaper.html`, `whitepaper.css`, `whitepaper.js`: revised public documentation and print flow.
- `api/index.js`, `vercel.json`: existing Vercel target, now routed through one server function.
- `tests/`: launch, commerce/security and real-browser local tests.
- `docs/DEPLOYMENT.md`: required configuration, deployment and recovery runbook.
- `docs/READINESS.md`: test evidence, unresolved dependencies and final checklist.

## Security model

All data access passes through the server. PostgreSQL is never called from a browser. Private order queries always include the authenticated user's ID. Administrator privileges come from the database, not provider profile claims or client input. State-changing browser requests require same-origin headers and a per-session CSRF token. Production sessions use Secure, HttpOnly, SameSite=Lax cookies with an eight-hour lifetime and PostgreSQL storage.

The schema enables RLS without anonymous policies and revokes PUBLIC table access. The trusted server uses the table-owning role and enforces authorization itself; it does **not** rely on per-user RLS policies. Never expose that database role/key to a client. See the runbook for deployment credentials and access rules.

Stripe webhooks use raw-body signatures. Payment status is retrieved independently using the secret provider API key, then checked against stored amount, currency, attempt, user, payment intent and live/test mode. Repeated events cannot create duplicate orders or fulfillment records. Browser-supplied transaction hashes are never accepted as payment proof.

No independent security audit has taken place. Local tests do not certify provider configuration, production infrastructure or network settlement.

## Original backup

An archive of the original project was written before substantial edits to:

`C:\Users\ROLLIE\AppData\Local\Temp\opencode\paynexis-backup-*.zip`

SHA-256: `426D81621A04F2EFDE22E08C4FF44E787C4FFEE1E69AC26D4AA8420BA8852841`.

Copy it to durable owner-controlled storage; the temporary directory is not a long-term backup service. No unrelated project or branding was used.

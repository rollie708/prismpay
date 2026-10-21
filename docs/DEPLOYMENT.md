# Paynexis deployment and operations

## 1. Required owner inputs

Supply access through the hosting/provider secret stores, not browser code or public chat:

1. The **existing Paynexis Vercel project/team**, its production domain and deployment permissions. No `.vercel` linkage or domain value was present. Link to that existing project; do not create a second brand/project.
2. A dedicated PostgreSQL database with TLS and automated backups.
3. A reputable OIDC identity provider such as Auth0, with hosted signup/login, verified email and recovery enabled. Use a confidential web application with authorization-code flow. Provider-specific hosted account settings are outside this app.
4. A first operator identity, granted admin after authenticating.
5. Real merchants, prices, currency, delivery requirements and operating/support policies.
6. Optional Stripe account, production credentials and webhook configuration for card checkout. Complete sandbox tests before activating production payments.
7. Separately: verified Robinhood Chain network, RPC, chain ID, contracts/ABIs, explorer, token details and desired transaction protocol. An on-chain adapter still needs implementation and intended-network testing; supplying environment values alone will not enable it.
8. The original uploaded Paynexis brand image, if it should supplement the preserved existing SVG logo.

## 2. Environment variables

All variables are **server-only**, with no `PUBLIC_` exposure. Copy `.env.example` for local development. Use the hosting secret manager in production.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `production` in production; controls Secure cookies, HTTPS requirements and Stripe live/test verification |
| `PORT` | Local server port, default 8000 |
| `APP_ORIGIN` | Exact canonical origin, no trailing slash/path; HTTPS required in production |
| `PAYNEXIS_LAUNCH_AT` | `2026-10-21T15:00:00Z`; defaults to this canonical value; Vercel production rejects changes |
| `DATABASE_URL` | PostgreSQL connection; use verified TLS, e.g. provider URL with `sslmode=verify-full` |
| `SESSION_SECRET` | At least 32 characters, generated from cryptographically random bytes; rotation invalidates sessions |
| `OIDC_ISSUER` | Exact HTTPS issuer URL from the identity provider |
| `OIDC_CLIENT_ID` | Confidential web client identifier |
| `OIDC_CLIENT_SECRET` | Client secret, server-side only |
| `PAYMENTS_ENABLED` | `false` until payment acceptance is complete; requires both Stripe secrets as well |
| `STRIPE_SECRET_KEY` | Sandbox key for staging; live key in production |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for this deployment's webhook endpoint |
| `ROBINHOOD_RPC_URL` | Reserved private network readiness metadata; not an implemented transaction connection |
| `ROBINHOOD_CHAIN_ID` | Reserved verified chain identifier, no default or invented value |
| `ROBINHOOD_EXPLORER_URL` | Reserved verified explorer URL; not published as a tested integration |

`VERCEL_ENV` is supplied by Vercel. Staging may use a short future launch timestamp; never change the production timestamp for tests.

Generate a session secret locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Store the output only in the secret store. Do not commit `.env`.

## 3. Database and authentication

Provision a Paynexis-only database. The application expects PostgreSQL semantics, advisory locks and transactions. Set a small pool compatible with your hosting plan; this implementation uses five connections per instance. Prefer a provider's session-compatible pooler when needed; test transaction/advisory lock compatibility.

```powershell
npm ci
npm run migrate
```

Migrations run in a transaction under an advisory lock and record their version. The same configured role owns the tables and is the trusted backend role. It must not be a superuser, must have no access to unrelated databases, and must never be shared with frontend clients. Anonymous/public database access has no granted policies. For managed platforms exposing REST endpoints, keep these tables out of exposed schemas or explicitly revoke their anonymous/authenticated roles. Do not add permissive RLS policies.

Register `${APP_ORIGIN}/auth/callback` as the exact provider callback URL. Configure provider email verification and recovery delivery. Set the allowed login/logout origins according to provider requirements. Test callback rejection, state/nonce mismatch, expired login, verified email, recovery, signout and session expiration using the real provider.

First sign in at `/auth/login`. Before launch, the resulting `/app` is locked but the provider identity is recorded. Then, from a trusted operator shell with the production database configured:

```powershell
npm run admin -- "https://your-exact-issuer/" "your-exact-provider-subject"
```

The command matches issuer + subject, not an unverified email. It records the role grant in the audit log. Open `/admin` after the grant. Role is reloaded from the database on each request. Ordinary users cannot access preparation tools before or after launch.

## 4. Deploy to the existing Vercel project

1. Keep all source files in the existing Paynexis project directory. Install the Vercel CLI if needed.
2. Run `vercel link` and explicitly select the **existing Paynexis** team/project. Preserve its domain assignment. Do not choose another workspace's project.
3. Set the environment variables for the appropriate preview/production environment. Set `APP_ORIGIN` to the actual URL that the browser will use. Redirect alternate domains to the canonical origin.
4. Apply migrations to the correct database before serving this version. Configure backups before accepting real data.
5. Run `npm test` and `npm run build` locally/CI.
6. Deploy a preview with `vercel`. Verify all paths, especially protected routes and API rewrites, on the actual platform.
7. After production setup and acceptance, deploy using `vercel --prod`. No launch-time redeployment is required. A deployment now occurs after the originally requested deadline.
8. Confirm existing production domain routing, DNS and certificate. Inspect Vercel function logs and alert configuration.

`vercel.json` publishes an empty static output directory and rewrites requests through `api/index.js`. The Express server explicitly allowlists public assets. Never publish the repository root as static files: this would bypass route enforcement and expose source/configuration. `views/app.html`, `.env`, scripts, migrations and backups must return 404 over HTTP.

Vercel config and project linkage still require real deployment validation. No hosting credential was available during implementation.

## 5. Launch behavior

`GET /api/launch-status` returns:

```json
{
  "status": "LIVE",
  "launchAt": "2026-10-21T15:00:00Z",
  "serverTime": "<trusted server UTC>",
  "available": false,
  "readiness": {
    "database": "unavailable",
    "accounts": "not_configured",
    "payments": "not_configured",
    "onchain": "unavailable"
  },
  "message": "Commerce service is unavailable. The operator must configure or restore the database."
}
```

The scheduler is request-time computation, not a cron or database toggle. At the timestamp the state changes immediately for the next request. Maintenance is a persistent operator setting read without application caching. An unknown database/maintenance state fails closed through `available:false`.

Before launch commerce APIs return 425 with `Retry-After`; maintenance/dependency failures return 503. HTML routes show the launch/service page at the corresponding status. Successful public browsing needs a ready schema; accounts and payments are separately unavailable until configured. A LIVE schedule alone is not a completed payment-platform launch.

All responses use `no-store`, including CDN-specific headers. The launch page samples server time, uses `performance.now()` for display elapsed time, polls at most every 15 seconds while pre-launch and schedules a check near the boundary. Maintenance/outage checks occur every 30 seconds. Network failures use capped exponential backoff and stop automatic retries after six failures; a retry control and visibility/online events resume checks. Live application pages do not continuously poll launch status; every action still checks the server gate.

## 6. Optional card payments

Stripe card checkout is independent of the intended Robinhood Chain integration. Leave `PAYMENTS_ENABLED=false` until acceptance is complete. Use an isolated preview database and test keys for sandbox testing, with `NODE_ENV=development` for Stripe test-mode verification (and no real user sessions on an HTTP deployment). For production, `NODE_ENV=production` requires live-mode payment objects.

Configure `https://<canonical-domain>/api/payments/webhook` for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Set the endpoint signing secret. The provider callback URL is not a payment proof. Payment success redirects the customer to their orders, where the server independently retrieves and verifies checkout. Webhooks also retrieve the provider object. The signed event's object alone is not used as fulfillment evidence.

Review provider account readiness, supported regions, receipt/tax/business settings and merchant settlement agreements. This implementation does not split settlements or pay merchants through Stripe Connect; funds settle to the configured platform Stripe account. Do not promise direct merchant wallet settlement. Product price is the exact quantity-one charged amount; there is no dynamic tax/shipping/discount engine.

If maintenance or pre-launch blocks a webhook, Stripe receives a retryable error. After restoration, inspect provider delivery history and retry failed events. Customers can explicitly check pending checkout status from Orders; no autonomous reconciliation worker is implemented. Monitor pending attempts and webhook delivery failures. Do not manually create paid orders to resolve a backlog.

Before enabling live payments, exercise real sandbox checkout, cancellation, expiry, rejection, signature failure, replay, delayed delivery, amount/currency mismatch and provider outage. Perform an authorized small production transaction after configuration. Local test fixtures are not evidence of real Stripe or chain settlement.

## 7. Monitoring, backups and recovery

- Application failures log an event, request ID, path and error code without stack traces, credentials, request bodies or payment details. Correlate support reports with `X-Request-ID`.
- Configure hosting alerts for elevated 5xx/latency and provider webhook failures. Configure an external uptime check for `/api/launch-status` that evaluates `available`, not just HTTP 200.
- Enable provider-managed daily PostgreSQL backups and point-in-time recovery where available. Set retention and recovery objectives based on order volume; recommended initial targets: 24-hour backup retention cadence, 30-day retention, and a tested restore within four hours. Actual provider setup and recovery timing are unverified.
- Keep encrypted off-provider backups with restricted operator access. Example operator command: `pg_dump --format=custom --file=paynexis-backup.dump "$env:DATABASE_URL"`. Avoid exposing connection strings in logs or shared shells.
- Before each migration/deployment, create a recovery point. Copy the original source ZIP to durable storage and retain a deployment artifact.
- Restore to a **new isolated database**, run `pg_restore --no-owner`, verify migrations/counts/constraints and ownership privileges, and test private-order access. Never experiment with restore on the only production database.
- During recovery enable maintenance when the database is accessible; if it is unavailable the app already fails closed. Restore records, reconcile provider payments since the recovery point using signed webhook redelivery/explicit verification, and compare provider transactions with unique stored references before reopening.
- Roll back application deployment only to a version compatible with the current schema. Do not restore the original static site as an active commerce backend. It has no server-side launch enforcement.
- Schedule database housekeeping daily: `DELETE FROM rate_limits WHERE expires_at < now() - interval '1 day';` and `DELETE FROM session WHERE expire < now();`. The session store also prunes expired sessions. Rate-limit correctness does not rely on this cleanup, but storage retention does.
- Define owner-approved profile/order retention, erasure/export support and merchant delivery procedures. Financial/audit record retention may differ from sessions.

## 8. Staging transition rehearsal

Use a separate deployment/database with `VERCEL_ENV=preview`. Set a future staging-only UTC `PAYNEXIS_LAUNCH_AT`, open the homepage, call protected APIs directly, and wait across the boundary without redeployment. Change the browser clock; it must not unlock access. Repeat with maintenance and an unavailable database. Check CDN responses and open tabs. Production keeps `2026-10-21T15:00:00Z` throughout.

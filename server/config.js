export const PRODUCTION_LAUNCH = '2026-10-21T15:00:00Z';

export function loadConfig(env = process.env) {
  const launchAt = env.PAYNEXIS_LAUNCH_AT || PRODUCTION_LAUNCH;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(launchAt) || !Number.isFinite(Date.parse(launchAt))) throw new Error('Invalid UTC launch timestamp');
  if (env.VERCEL_ENV === 'production' && launchAt !== PRODUCTION_LAUNCH) throw new Error('Production launch timestamp must remain canonical');
  const production = env.NODE_ENV === 'production';
  const origin = env.APP_ORIGIN || 'http://localhost:8000';
  if (new URL(origin).origin !== origin || (production && !origin.startsWith('https://'))) throw new Error('APP_ORIGIN must be a canonical origin; production requires HTTPS');
  return {
    launchAt, production, origin, databaseUrl: env.DATABASE_URL,
    sessionSecret: env.SESSION_SECRET,
    oidcIssuer: env.OIDC_ISSUER, oidcClientId: env.OIDC_CLIENT_ID, oidcClientSecret: env.OIDC_CLIENT_SECRET,
    paymentsEnabled: env.PAYMENTS_ENABLED === 'true', stripeKey: env.STRIPE_SECRET_KEY, stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    networkConfigured: Boolean(env.ROBINHOOD_RPC_URL && env.ROBINHOOD_CHAIN_ID && env.ROBINHOOD_EXPLORER_URL)
  };
}

export function launchState(launchAt, maintenance, now = Date.now()) {
  return maintenance ? 'MAINTENANCE' : now < Date.parse(launchAt) ? 'PRE_LAUNCH' : 'LIVE';
}

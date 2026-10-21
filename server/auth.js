import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import * as oidc from 'openid-client';
import { randomUUID, randomBytes } from 'node:crypto';
import { fail } from './validation.js';

export function authenticationConfigured(config, db) {
  return Boolean(db && config.sessionSecret?.length >= 32 && config.oidcIssuer && config.oidcClientId && config.oidcClientSecret);
}
export function installAuth(app, {config, db, limit, testIdentity}) {
  const configured = authenticationConfigured(config,db);
  let discovery;
  const provider = () => {
    if (!discovery) discovery = oidc.discovery(new URL(config.oidcIssuer),config.oidcClientId,config.oidcClientSecret).catch(e => { discovery = null; throw e; });
    return discovery;
  };
  if (configured) {
    const Store = connectPgSimple(session);
    app.use(session({
      store: new Store({ pool: db.pool, createTableIfMissing: false }),
      secret: config.sessionSecret, name: config.production ? '__Host-paynexis' : 'paynexis',
      resave: false, saveUninitialized: false,
      cookie: { secure: config.production, httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
    }));
  }
  app.use(async (req,res,next) => {
    if (req.session?.userId && db) {
      req.user = (await db.query('SELECT id,email,name,role FROM users WHERE id=$1',[req.session.userId])).rows[0];
    }
    // Dependency injection used only by tests; never derived from a request or environment flag.
    if (testIdentity) req.user = await testIdentity(req);
    next();
  });
  app.get('/auth/login', limit('login',20), async (req,res) => {
    if (!configured) fail(503,'AUTH_NOT_CONFIGURED','Account access is not configured.');
    const client = await provider();
    await new Promise((resolve,reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
    const verifier = oidc.randomPKCECodeVerifier();
    req.session.oidc = { verifier, state: oidc.randomState(), nonce: oidc.randomNonce(), started: Date.now() };
    const url = oidc.buildAuthorizationUrl(client, {
      redirect_uri: `${config.origin}/auth/callback`, scope: 'openid email profile',
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
      state: req.session.oidc.state, nonce: req.session.oidc.nonce
    });
    await new Promise((resolve,reject) => req.session.save(e => e ? reject(e) : resolve()));
    res.redirect(url.href);
  });
  app.get('/auth/callback', limit('callback',30), async (req,res) => {
    if (!configured) fail(503,'AUTH_NOT_CONFIGURED','Account access is not configured.');
    const attempt = req.session?.oidc;
    if (!attempt || Date.now() - attempt.started > 10 * 60 * 1000) fail(400,'LOGIN_EXPIRED','Sign-in expired. Please try again.');
    delete req.session.oidc;
    const tokens = await oidc.authorizationCodeGrant(await provider(),new URL(req.originalUrl,config.origin), {
      pkceCodeVerifier: attempt.verifier, expectedState: attempt.state, expectedNonce: attempt.nonce, idTokenExpected: true
    });
    const claims = tokens.claims();
    if (!claims?.sub || !claims.email || claims.email_verified !== true) fail(403,'EMAIL_UNVERIFIED','Verify your email with your account provider before signing in.');
    const { rows } = await db.query(`INSERT INTO users(id,issuer,subject,email,name) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(issuer,subject) DO UPDATE SET email=excluded.email,updated_at=now() RETURNING id`,
    [randomUUID(),claims.iss,claims.sub,claims.email,String(claims.name || '').slice(0,120)]);
    await new Promise((resolve,reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
    req.session.userId = rows[0].id;
    req.session.csrf = randomBytes(32).toString('hex');
    await new Promise((resolve,reject) => req.session.save(e => e ? reject(e) : resolve()));
    res.redirect('/app');
  });
  app.post('/auth/logout', requireUser, csrf, (req,res,next) => {
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie(config.production ? '__Host-paynexis' : 'paynexis', { secure: config.production, httpOnly: true, sameSite: 'lax' });
      res.json({ok:true});
    });
  });
}
export function requireUser(req,res,next) { if (!req.user) return next(Object.assign(new Error('Sign in to continue.'),{status:401,code:'AUTH_REQUIRED'})); next(); }
export function requireAdmin(req,res,next) { if (req.user?.role !== 'admin') return next(Object.assign(new Error('Administrator access required.'),{status:403,code:'ADMIN_REQUIRED'})); next(); }
export function csrf(req,res,next) {
  if (!req.session?.csrf || req.get('x-csrf-token') !== req.session.csrf) return next(Object.assign(new Error('Refresh your session and try again.'),{status:403,code:'CSRF_INVALID'}));
  next();
}

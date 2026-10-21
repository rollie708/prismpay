import express from 'express';
import helmet from 'helmet';
import Stripe from 'stripe';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadConfig, launchState } from './config.js';
import { database } from './db.js';
import { installAuth, authenticationConfigured, requireUser, requireAdmin, csrf } from './auth.js';
import { productInput, merchantInput, tokenInput, uuid, parse, fail } from './validation.js';
import { paymentConfigured, recordVerifiedPayment, beginCheckout } from './payments.js';

const root = fileURLToPath(new URL('../',import.meta.url));
export function createApp(options = {}) {
  const config = options.config || loadConfig();
  const db = options.db === undefined ? database(config.databaseUrl) : options.db;
  const clock = options.clock || Date.now;
  const stripe = options.stripe || (config.stripeKey ? new Stripe(config.stripeKey,{timeout:10000,maxNetworkRetries:1}) : null);
  const app = express();
  app.disable('x-powered-by');
  if (config.production) app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{
    defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'",'https://fonts.googleapis.com'],
    fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'data:'],connectSrc:["'self'"],
    frameAncestors:["'none'"],formAction:["'self'"],upgradeInsecureRequests:config.production ? [] : null
  }},strictTransportSecurity:config.production ? undefined : false}));
  app.use((req,res,next) => {
    res.set({'Cache-Control':'no-store, max-age=0','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store'});
    req.requestId = randomUUID(); res.set('X-Request-ID',req.requestId);
    next();
  });
  async function status() {
    let settings = null;
    if (db) {
      try {
        // Probe schema, not merely connectivity. Maintenance reads are never cached.
        const result = await db.query("SELECT c.maintenance FROM configuration c WHERE c.id=1 AND EXISTS(SELECT 1 FROM schema_migrations WHERE version='001_commerce.sql')");
        settings = result.rows[0];
      } catch { /* Public service state is intentionally generic. */ }
    }
    const state = launchState(config.launchAt,settings?.maintenance || false,clock());
    return {status:state,launchAt:config.launchAt,serverTime:new Date(clock()).toISOString(),
      available:state === 'LIVE' && Boolean(settings),
      readiness:{database:settings ? 'ready' : 'unavailable',accounts:authenticationConfigured(config,db) ? 'configured' : 'not_configured',
        payments:paymentConfigured(config) ? 'configured' : 'not_configured',onchain:'unavailable'},
      message: !settings ? 'Commerce service is unavailable. The operator must configure or restore the database.' : state === 'MAINTENANCE' ? 'Paynexis is undergoing maintenance.' : null};
  }
  const needDb = (req,res,next) => { if (!db) fail(503,'DATABASE_UNAVAILABLE','Commerce service is unavailable.'); next(); };
  const gate = async (req,res,next) => {
    const state = await status();
    if (!state.available) {
      const code = state.status === 'PRE_LAUNCH' ? 425 : 503;
      res.set('Retry-After',state.status === 'PRE_LAUNCH' ? String(Math.max(1,Math.min(60,Math.ceil((Date.parse(config.launchAt)-clock())/1000)))) : '30');
      if (!req.originalUrl.startsWith('/api/')) return res.status(code).sendFile(`${root}index.html`);
      return res.status(code).json({error:state.status === 'LIVE' ? 'SERVICE_UNAVAILABLE' : state.status,message:state.message || 'Paynexis has not launched yet.',...state});
    }
    next();
  };
  const limit = (scope,max=60) => async (req,res,next) => {
    if (!db) return next();
    const identity = req.user?.id || req.ip;
    const key = createHash('sha256').update(`${scope}:${identity}`).digest('hex');
    const {rows} = await db.query(`INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+interval '1 minute')
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<=now() THEN 1 ELSE rate_limits.count+1 END,
      expires_at=CASE WHEN rate_limits.expires_at<=now() THEN now()+interval '1 minute' ELSE rate_limits.expires_at END RETURNING count`,[key]);
    if (rows[0].count>max) { res.set('Retry-After','60'); fail(429,'RATE_LIMIT','Too many requests. Try again in a minute.'); }
    next();
  };
  app.get('/api/launch-status',async (req,res) => res.json(await status()));
  // Webhook signature is checked against the untouched request bytes. Gate applies even to direct webhooks.
  app.post('/api/payments/webhook',gate,express.raw({type:'application/json',limit:'256kb'}),async (req,res) => {
    if (!paymentConfigured(config)) fail(503,'PAYMENTS_UNAVAILABLE','Payment integration not configured.');
    let event;
    try { event = stripe.webhooks.constructEvent(req.body,req.get('stripe-signature'),config.stripeWebhookSecret); }
    catch { fail(400,'INVALID_SIGNATURE','Invalid payment signature.'); }
    if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
      const session = await stripe.checkout.sessions.retrieve(event.data.object.id,{expand:['payment_intent']});
      await recordVerifiedPayment(db,session,event.id,config.production);
    } else if (['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type)) {
      await db.query("UPDATE payment_attempts SET status=$2,updated_at=now() WHERE provider_session=$1 AND status='pending'",[event.data.object.id,event.type.endsWith('expired')?'expired':'failed']);
    }
    res.json({received:true});
  });
  app.use(express.json({limit:'32kb'}));
  app.use((req,res,next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('origin') !== config.origin) fail(403,'ORIGIN_INVALID','Request origin is not permitted.');
    next();
  });
  installAuth(app,{config,db,limit,testIdentity:options.testIdentity});
  app.get('/api/session',(req,res) => res.json({user:req.user || null,csrf:req.session?.csrf || null,accountsConfigured:authenticationConfigured(config,db)}));
  app.use('/api/commerce',gate,limit('commerce',120));
  app.get('/api/commerce/products',async (req,res) => {
    const q = parse(z.string().max(160),req.query.q || '');
    const kind = parse(z.enum(['','product','service']),req.query.kind || '');
    const page = parse(z.coerce.number().int().min(1).max(10000),req.query.page || 1);
    const {rows} = await db.query(`SELECT p.*,m.name AS merchant_name FROM products p JOIN merchants m ON m.id=p.merchant_id
      WHERE p.status='published' AND m.verified AND m.active AND ($1='' OR p.name ILIKE '%' || $1 || '%' OR p.description ILIKE '%' || $1 || '%')
      AND ($2='' OR p.kind=$2) ORDER BY p.created_at DESC,p.id LIMIT 25 OFFSET $3`,[q,kind,(page-1)*24]);
    res.json({products:rows.slice(0,24),hasMore:rows.length>24,page});
  });
  app.get('/api/commerce/products/:id',async (req,res) => {
    const id = parse(uuid,req.params.id);
    const {rows} = await db.query(`SELECT p.*,m.name AS merchant_name FROM products p JOIN merchants m ON m.id=p.merchant_id
      WHERE p.id=$1 AND p.status='published' AND m.verified AND m.active`,[id]);
    if (!rows.length) fail(404,'NOT_FOUND','Listing not found.');
    res.json({product:rows[0],checkoutAvailable:paymentConfigured(config) && rows[0].fulfillment_method==='manual'});
  });
  app.get('/api/commerce/methods',(req,res) => res.json({methods:paymentConfigured(config)?[{id:'stripe',name:'Card · Stripe Checkout'}]:[],onchain:{networkFocus:'Robinhood Chain',available:false},message:paymentConfigured(config)?null:'Payment integration not configured'}));
  app.get('/api/commerce/orders',requireUser,async (req,res) => {
    const {rows} = await db.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id]);
    const attempts = await db.query("SELECT id,status,created_at,snapshot FROM payment_attempts WHERE user_id=$1 AND status<>'confirmed' ORDER BY created_at DESC LIMIT 30",[req.user.id]);
    res.json({orders:rows,attempts:attempts.rows});
  });
  app.get('/api/commerce/orders/:id',requireUser,async (req,res) => {
    const {rows} = await db.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2',[parse(uuid,req.params.id),req.user.id]);
    if (!rows.length) fail(404,'NOT_FOUND','Order not found.');
    res.json({order:rows[0]});
  });
  app.patch('/api/commerce/account',requireUser,csrf,limit('account',10),async (req,res) => {
    const {name} = parse(z.object({name:z.string().trim().min(1).max(120)}).strict(),req.body);
    await db.query('UPDATE users SET name=$2,updated_at=now() WHERE id=$1',[req.user.id,name]); res.json({ok:true});
  });
  app.post('/api/commerce/checkout',requireUser,csrf,limit('checkout',10),async (req,res) => {
    if (!paymentConfigured(config)) fail(503,'PAYMENTS_UNAVAILABLE','Payment integration not configured.');
    const {productId} = parse(z.object({productId:uuid}).strict(),req.body);
    res.json(await beginCheckout(db,stripe,req.user.id,productId,parse(uuid,req.get('idempotency-key')),config.origin));
  });
  app.post('/api/commerce/payments/:id/verify',requireUser,csrf,limit('verify',20),async (req,res) => {
    if (!paymentConfigured(config)) fail(503,'PAYMENTS_UNAVAILABLE','Payment integration not configured.');
    const attempt = (await db.query('SELECT * FROM payment_attempts WHERE id=$1 AND user_id=$2',[parse(uuid,req.params.id),req.user.id])).rows[0];
    if (!attempt) fail(404,'NOT_FOUND','Checkout not found.');
    if (!attempt.provider_session) return res.json({status:'pending'});
    const session = await stripe.checkout.sessions.retrieve(attempt.provider_session,{expand:['payment_intent']});
    res.json(await recordVerifiedPayment(db,session,null,config.production));
  });
  // Operators can prepare the catalog and inspect readiness before launch; ordinary users cannot.
  app.use('/api/admin',requireUser,requireAdmin,needDb,limit('admin',120));
  app.use('/api/admin',(req,res,next) => ['GET','HEAD'].includes(req.method) ? next() : csrf(req,res,next));
  const audit = (c,req,action,id,detail={}) => c.query('INSERT INTO audit_logs(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),req.user.id,action,id,detail]);
  app.get('/api/admin/readiness',async (req,res) => {
    const launch = await status();
    const settings = (await db.query('SELECT * FROM configuration WHERE id=1')).rows[0];
    const counts = (await db.query("SELECT (SELECT count(*) FROM products WHERE status='published') AS published_products,(SELECT count(*) FROM merchants WHERE verified AND active) AS verified_merchants")).rows[0];
    res.json({launch,settings,counts,checks:{
      sessionSecret:config.sessionSecret?.length>=32,oidc:authenticationConfigured(config,db),
      paymentAdapter:paymentConfigured(config)?'configured; verify provider delivery and acceptance evidence':'disabled',
      onchain:'No transaction adapter implemented; requires verified chain, RPC, contracts and complete network testing.',
      token:'Private metadata only. No balance, token checkout or utility enabled.',
      networkMetadata:config.networkConfigured?'configured, not validated':'missing',
      tls:config.production && config.origin.startsWith('https://')?'configured origin; validate deployed TLS':'local development',
      deployment:'Domain, provider connectivity, backups and production smoke tests require operator verification.'
    }});
  });
  app.get('/api/admin/products',async (req,res) => res.json({products:(await db.query('SELECT * FROM products ORDER BY created_at DESC LIMIT 500')).rows}));
  app.get('/api/admin/merchants',async (req,res) => res.json({merchants:(await db.query('SELECT * FROM merchants ORDER BY created_at DESC LIMIT 500')).rows}));
  for (const method of ['post','put']) {
    app[method](`/api/admin/products${method==='put'?'/:id':''}`,async (req,res) => {
      const p = parse(productInput,req.body); const id = method==='put'?parse(uuid,req.params.id):randomUUID();
      await db.transaction(async c => {
        const merchant = (await c.query('SELECT * FROM merchants WHERE id=$1 FOR SHARE',[p.merchant_id])).rows[0];
        if (!merchant || (p.status==='published' && (!merchant.verified || !merchant.active))) fail(400,'MERCHANT_UNVERIFIED','Publishing requires a verified, active merchant.');
        const values = [id,p.name,p.description,p.kind,p.price_minor,p.currency,p.status,p.merchant_id,p.fulfillment_method,p.requirements];
        const result = method==='post' ? await c.query('INSERT INTO products(id,name,description,kind,price_minor,currency,status,merchant_id,fulfillment_method,requirements) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',values) :
          await c.query('UPDATE products SET name=$2,description=$3,kind=$4,price_minor=$5,currency=$6,status=$7,merchant_id=$8,fulfillment_method=$9,requirements=$10,updated_at=now() WHERE id=$1 RETURNING id',values);
        if (!result.rows.length) fail(404,'NOT_FOUND','Listing not found.');
        await audit(c,req,`product.${method}`,id,{status:p.status});
      });
      res.status(method==='post'?201:200).json({id});
    });
    app[method](`/api/admin/merchants${method==='put'?'/:id':''}`,async (req,res) => {
      const m = parse(merchantInput,req.body); const id = method==='put'?parse(uuid,req.params.id):randomUUID();
      await db.transaction(async c => {
        const values=[id,m.name,m.contact_email,m.verified,m.active];
        const result = method==='post' ? await c.query('INSERT INTO merchants(id,name,contact_email,verified,active) VALUES($1,$2,$3,$4,$5) RETURNING id',values) :
          await c.query('UPDATE merchants SET name=$2,contact_email=$3,verified=$4,active=$5,updated_at=now() WHERE id=$1 RETURNING id',values);
        if (!result.rows.length) fail(404,'NOT_FOUND','Merchant not found.');
        await audit(c,req,`merchant.${method}`,id,{verified:m.verified,active:m.active});
      }); res.status(method==='post'?201:200).json({id});
    });
  }
  app.get('/api/admin/orders',async (req,res) => res.json({orders:(await db.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100')).rows,attempts:(await db.query('SELECT id,user_id,status,provider_session,created_at FROM payment_attempts ORDER BY created_at DESC LIMIT 100')).rows}));
  app.post('/api/admin/orders/:id/fulfill',async (req,res) => {
    const id=parse(uuid,req.params.id); const {note}=parse(z.object({note:z.string().trim().min(1).max(2000)}).strict(),req.body);
    await db.transaction(async c => {
      const order=(await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (!order) fail(404,'NOT_FOUND','Order not found.');
      if (order.fulfillment_status==='fulfilled') return;
      if (!order.payment_verified_at || order.snapshot.fulfillment_method!=='manual') fail(409,'FULFILLMENT_UNAVAILABLE','Verified payment and a manual delivery method are required.');
      await c.query('INSERT INTO fulfillment_events(id,order_id,actor_id,note) VALUES($1,$2,$3,$4)',[randomUUID(),id,req.user.id,note]);
      await c.query("UPDATE orders SET status='fulfilled',fulfillment_status='fulfilled',fulfillment_note=$2,updated_at=now() WHERE id=$1",[id,note]);
      await audit(c,req,'order.fulfilled',id);
    }); res.json({ok:true});
  });
  app.patch('/api/admin/configuration',async (req,res) => {
    const input=parse(z.object({maintenance:z.boolean().optional(),token:tokenInput.optional()}).strict().refine(v=>Object.keys(v).length>0),req.body);
    await db.transaction(async c => {
      if (input.maintenance!==undefined) await c.query('UPDATE configuration SET maintenance=$1,updated_at=now() WHERE id=1',[input.maintenance]);
      if (input.token) await c.query('UPDATE configuration SET token=$1,updated_at=now() WHERE id=1',[input.token]);
      await audit(c,req,'configuration.updated','1',{fields:Object.keys(input),maintenance:input.maintenance});
    }); res.json({ok:true});
  });
  app.get('/api/admin/audit',async (req,res) => res.json({events:(await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100')).rows}));
  app.get(['/admin','/admin/{*path}'],requireUser,requireAdmin,(req,res)=>res.sendFile(`${root}views/app.html`));
  app.get(['/app','/app/{*path}'],gate,(req,res)=>res.sendFile(`${root}views/app.html`));
  app.get(['/','/index.html'],(req,res)=>res.sendFile(`${root}index.html`));
  // Explicit allowlist: source, backups, migrations, environment and private HTML are never static assets.
  for (const file of ['styles.css','script.js','whitepaper.html','whitepaper.css','whitepaper.js','product.css','website.css','app.js','logo.svg']) {
    app.get(`/${file}`,(req,res)=>res.sendFile(`${root}${file}`));
  }
  app.use((req,res)=>res.status(404).json({error:'NOT_FOUND',message:'Page not found.'}));
  app.use((error,req,res,next)=>{
    if (res.headersSent) return next(error);
    const code = error.status || (error.type==='entity.too.large'?413:500);
    if (code>=500) console.error(JSON.stringify({event:'request_failed',requestId:req.requestId,path:req.path,code:error.code || 'INTERNAL_ERROR'}));
    const expected = Boolean(error.status && error.code);
    res.status(code).json({error:expected?error.code:code>=500?'SERVICE_UNAVAILABLE':'INVALID_REQUEST',message:expected?error.message:code>=500?'This service is unavailable. Please try again later.':'Invalid request.',requestId:req.requestId});
  });
  return app;
}

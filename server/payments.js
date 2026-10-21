import { randomUUID } from 'node:crypto';
import { fail } from './validation.js';

export function paymentConfigured(config) {
  return Boolean(config.paymentsEnabled && config.stripeKey && config.stripeWebhookSecret);
}

// Never trust browser-provided payment status or transaction hashes. This function
// accepts only a Checkout Session retrieved using the server's Stripe credentials.
export async function recordVerifiedPayment(db, session, eventId, production) {
  return db.transaction(async c => {
    const attempt = (await c.query('SELECT * FROM payment_attempts WHERE provider_session=$1 FOR UPDATE',[session.id])).rows[0];
    if (!attempt) fail(422,'PAYMENT_UNMATCHED','Payment does not match a checkout.');
    if (session.payment_status !== 'paid' || session.status !== 'complete') {
      const status = session.status === 'expired' ? 'expired' : attempt.status === 'failed' ? 'failed' : 'pending';
      if (status === 'expired' && attempt.status === 'pending') await c.query("UPDATE payment_attempts SET status='expired',updated_at=now() WHERE id=$1",[attempt.id]);
      return {status};
    }
    const intent = session.payment_intent;
    if (session.mode !== 'payment' || session.livemode !== production || !intent || typeof intent === 'string' || intent.status !== 'succeeded' ||
        session.amount_total !== attempt.amount_minor || session.currency !== attempt.currency.toLowerCase() ||
        intent.amount_received !== attempt.amount_minor || intent.currency !== attempt.currency.toLowerCase() ||
        intent.livemode !== production || session.client_reference_id !== attempt.id ||
        session.metadata?.attempt_id !== attempt.id || intent.metadata?.attempt_id !== attempt.id ||
        session.metadata?.user_id !== attempt.user_id) fail(422,'PAYMENT_MISMATCH','Payment verification failed. Contact support.');
    if (eventId) {
      const inserted = await c.query('INSERT INTO payment_events(id,type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',[eventId,'checkout.verified']);
      if (!inserted.rows.length) return {status:'confirmed'};
    }
    await c.query(`INSERT INTO orders(id,user_id,payment_attempt_id,snapshot,amount_minor,currency,payment_reference,payment_verified_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(payment_attempt_id) DO NOTHING`,
    [randomUUID(),attempt.user_id,attempt.id,attempt.snapshot,attempt.amount_minor,attempt.currency,intent.id]);
    await c.query("UPDATE payment_attempts SET status='confirmed',updated_at=now() WHERE id=$1",[attempt.id]);
    const order = (await c.query('SELECT id FROM orders WHERE payment_attempt_id=$1',[attempt.id])).rows[0];
    return {status:'confirmed',orderId:order.id};
  });
}

export async function beginCheckout(db,stripe,userId,productId,key,origin) {
  const attempt = await db.transaction(async c => {
    // Serialize one user's idempotency key across concurrent requests.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${userId}:${key}`]);
    const existing = (await c.query('SELECT * FROM payment_attempts WHERE user_id=$1 AND idempotency_key=$2',[userId,key])).rows[0];
    if (existing) {
      if (existing.product_id !== productId) fail(409,'IDEMPOTENCY_CONFLICT','This checkout key was used for a different product.');
      return existing;
    }
    const product = (await c.query(`SELECT p.* FROM products p JOIN merchants m ON m.id=p.merchant_id
      WHERE p.id=$1 AND p.status='published' AND m.verified AND m.active AND p.fulfillment_method='manual' FOR SHARE OF p,m`,[productId])).rows[0];
    if (!product) fail(409,'PRODUCT_UNAVAILABLE','This listing is not available for checkout.');
    const snapshot = {name:product.name,description:product.description,merchant_id:product.merchant_id,requirements:product.requirements,fulfillment_method:product.fulfillment_method};
    return (await c.query(`INSERT INTO payment_attempts(id,user_id,product_id,idempotency_key,snapshot,amount_minor,currency)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[randomUUID(),userId,productId,key,snapshot,product.price_minor,product.currency])).rows[0];
  });
  if (attempt.status !== 'pending') fail(409,'CHECKOUT_FINISHED','This checkout has already finished. View your orders or start a new checkout.');
  // Stripe idempotency retention is finite: never create a session again after 23 hours.
  if (Date.now()-new Date(attempt.created_at).getTime() > 23*60*60*1000) fail(409,'CHECKOUT_EXPIRED','Start a new checkout.');
  const session = attempt.provider_session ? await stripe.checkout.sessions.retrieve(attempt.provider_session) : await stripe.checkout.sessions.create({
    mode:'payment',payment_method_types:['card'], client_reference_id:attempt.id,
    metadata:{attempt_id:attempt.id,user_id:userId},payment_intent_data:{metadata:{attempt_id:attempt.id}},
    line_items:[{quantity:1,price_data:{currency:attempt.currency.toLowerCase(),unit_amount:attempt.amount_minor,product_data:{name:attempt.snapshot.name}}}],
    success_url:`${origin}/app/orders?attempt=${attempt.id}`,cancel_url:`${origin}/app/products/${productId}`
  },{idempotencyKey:attempt.id});
  await db.query('UPDATE payment_attempts SET provider_session=$2,updated_at=now() WHERE id=$1',[attempt.id,session.id]);
  if (session.status !== 'open' || !session.url) fail(409,'CHECKOUT_FINISHED','Checkout is complete or expired. View your orders.');
  return {url:session.url,attemptId:attempt.id};
}

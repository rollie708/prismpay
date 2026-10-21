import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

export async function fixture({now=Date.parse('2026-10-21T15:00:00Z'),payments=false}={}){
  const pg=new PGlite();
  await pg.exec(await readFile(new URL('../migrations/001_commerce.sql',import.meta.url),'utf8'));
  await pg.query("INSERT INTO schema_migrations(version) VALUES('001_commerce.sql')");
  let queue=Promise.resolve();
  const db={query:(sql,args)=>pg.query(sql,args),transaction(fn){
    const job=queue.then(()=>pg.transaction(tx=>fn(tx)));queue=job.catch(()=>{});return job;
  }};
  const users={customer:{id:randomUUID(),email:'customer@example.test',name:'Customer',role:'customer'},other:{id:randomUUID(),email:'other@example.test',name:'Other',role:'customer'},admin:{id:randomUUID(),email:'admin@example.test',name:'Operator',role:'admin'}};
  for(const u of Object.values(users))await db.query('INSERT INTO users(id,issuer,subject,email,name,role) VALUES($1,$2,$3,$4,$5,$6)',[u.id,'https://identity.example.test',u.id,u.email,u.name,u.role]);
  const config=loadConfig({APP_ORIGIN:'http://localhost:8000',PAYMENTS_ENABLED:payments?'true':'false',STRIPE_SECRET_KEY:payments?'sk_test_fixture':undefined,STRIPE_WEBHOOK_SECRET:payments?'whsec_fixture':undefined});
  let time=now;
  const app=createApp({config,db,clock:()=>time,testIdentity:req=>{
    const user=users[req.get('x-test-user')];
    if(user)req.session={csrf:'test-csrf-token'};
    return user;
  }});
  return {app,db,pg,users,config,setTime:value=>time=value,close:()=>pg.close()};
}
export function authorized(request,user='admin'){
  return request.set('x-test-user',user).set('Origin','http://localhost:8000').set('x-csrf-token','test-csrf-token');
}
export async function listing(db){
  const merchantId=randomUUID(),productId=randomUUID();
  await db.query('INSERT INTO merchants(id,name,contact_email,verified) VALUES($1,$2,$3,true)',[merchantId,'Test-only merchant','merchant@example.test']);
  await db.query(`INSERT INTO products(id,name,description,kind,price_minor,currency,status,merchant_id,fulfillment_method,requirements)
    VALUES($1,'Test-only product','Fixture listing','product',2500,'USD','published',$2,'manual','Operator delivers after verification')`,[productId,merchantId]);
  return {merchantId,productId};
}
export async function paymentFixture(db,userId){
  const {productId}=await listing(db);const id=randomUUID();
  const snapshot={name:'Test-only product',requirements:'Manual test delivery',fulfillment_method:'manual'};
  await db.query('INSERT INTO payment_attempts(id,user_id,product_id,idempotency_key,snapshot,amount_minor,currency,provider_session) VALUES($1,$2,$3,$4,$5,2500,$6,$7)',[id,userId,productId,randomUUID(),snapshot,'USD',`cs_${id}`]);
  const session={id:`cs_${id}`,status:'complete',payment_status:'paid',mode:'payment',livemode:false,amount_total:2500,currency:'usd',client_reference_id:id,metadata:{attempt_id:id,user_id:userId},payment_intent:{id:`pi_${id}`,status:'succeeded',amount_received:2500,currency:'usd',livemode:false,metadata:{attempt_id:id}}};
  return {id,session,productId};
}

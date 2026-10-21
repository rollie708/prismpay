import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { launchState,loadConfig,PRODUCTION_LAUNCH } from '../server/config.js';
import { createApp } from '../server/app.js';
import { fixture,authorized } from './helpers.js';
const launch=Date.parse(PRODUCTION_LAUNCH);
test('canonical UTC boundary, maintenance precedence and production timestamp validation',()=>{
  assert.equal(launchState(PRODUCTION_LAUNCH,false,launch-1),'PRE_LAUNCH');
  assert.equal(launchState(PRODUCTION_LAUNCH,false,launch),'LIVE');
  assert.equal(launchState(PRODUCTION_LAUNCH,false,launch+1),'LIVE');
  assert.equal(launchState(PRODUCTION_LAUNCH,true,launch-1),'MAINTENANCE');
  assert.equal(launchState(PRODUCTION_LAUNCH,true,launch+1),'MAINTENANCE');
  assert.throws(()=>loadConfig({PAYNEXIS_LAUNCH_AT:'tomorrow'}));
  assert.throws(()=>loadConfig({VERCEL_ENV:'production',PAYNEXIS_LAUNCH_AT:'2026-10-21T15:01:00Z'}));
});
test('server gate changes without redeployment; forged browser clocks and routes cannot bypass it',async t=>{
  const f=await fixture({now:launch-1});t.after(f.close);
  const status=await request(f.app).get('/api/launch-status').expect(200);
  assert.equal(status.body.status,'PRE_LAUNCH');assert.match(status.headers['cache-control'],/no-store/);
  assert.equal(status.body.launchAt,PRODUCTION_LAUNCH);
  await request(f.app).get('/app').expect(425);
  await request(f.app).get('/app/orders').expect(425);
  const blocked=await request(f.app).get('/api/commerce/products?now=9999999999999').set('Date','Wed, 21 Oct 2099 15:00:00 GMT').expect(425);
  assert.equal(blocked.body.status,'PRE_LAUNCH');
  await authorized(request(f.app).post('/api/commerce/checkout'),'customer').send({}).expect(425);
  await request(f.app).post('/api/payments/webhook').send({}).expect(425);
  await request(f.app).get('/views/app.html').expect(404);
  await request(f.app).get('/.env').expect(404);
  await request(f.app).get('/server/app.js').expect(404);
  await request(f.app).get('/api/admin/readiness').expect(401);
  await authorized(request(f.app).get('/api/admin/readiness')).expect(200);
  f.setTime(launch);
  const live=await request(f.app).get('/api/launch-status').expect(200);
  assert.equal(live.body.status,'LIVE');assert.equal(live.body.available,true);
  await request(f.app).get('/app').expect(200);
  await request(f.app).get('/api/commerce/products').expect(200);
  await authorized(request(f.app).patch('/api/admin/configuration')).send({maintenance:true}).expect(200);
  const maintenance=await request(f.app).get('/api/launch-status').expect(200);
  assert.equal(maintenance.body.status,'MAINTENANCE');
  await request(f.app).get('/api/commerce/products').expect(503);
  await authorized(request(f.app).patch('/api/admin/configuration')).send({maintenance:false}).expect(200);
  await request(f.app).get('/api/commerce/products').expect(200);
});
test('missing or failed critical services never claim product availability',async()=>{
  for(const db of [null,{query:async()=>{throw new Error('secret database connection');}}]){
    const app=createApp({config:loadConfig(),db,clock:()=>launch});
    const result=await request(app).get('/api/launch-status').expect(200);
    assert.equal(result.body.status,'LIVE');assert.equal(result.body.available,false);assert.equal(result.body.readiness.database,'unavailable');
    await request(app).get('/app').expect(503);
    const error=await request(app).get('/api/commerce/products').expect(503);
    assert.ok(!JSON.stringify(error.body).includes('secret database'));
  }
});

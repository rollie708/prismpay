import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {fixture} from './helpers.js';

test('open browser transitions at a shortened staging timestamp; altered browser clock cannot unlock; responsive live and outage states',async t=>{
  const f=await fixture();
  // This is a separate test-only server/configuration, never the production environment variable.
  f.config.launchAt=new Date(Math.ceil((Date.now()+5000)/1000)*1000).toISOString();
  const launch=Date.parse(f.config.launchAt);
  f.setTime(launch-1500);
  const server=f.app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true});
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));await f.close();});
  const context=await browser.newContext();
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{Date.now=()=>Date.parse('2099-10-21T15:00:00Z');});
  await page.goto(origin);
  await page.getByText('The next chapter begins soon').waitFor();
  assert.equal(await page.locator('#enter-app').isVisible(),false);
  assert.equal(await page.locator('#countdown').isVisible(),true);
  const direct=await context.request.get(`${origin}/api/commerce/products`);
  assert.equal(direct.status(),425);
  f.setTime(launch);
  await page.waitForURL(`${origin}/app`,{timeout:10000});
  await page.getByRole('heading',{name:'Commerce, connected.'}).waitFor();
  let statusRequests=0;page.on('request',req=>{if(req.url().includes('/api/launch-status'))statusRequests++;});
  for(const [width,height] of [[1440,1000],[768,1024],[390,844]]){
    await page.setViewportSize({width,height});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No overflow at ${width}`);
    await page.screenshot({path:`test-results/commerce-${width}.png`,fullPage:true});
  }
  await page.getByRole('link',{name:'Explore the catalog ↗'}).click();
  await page.getByRole('heading',{name:'Discover',exact:true}).waitFor();
  await page.getByLabel('Search catalog').fill('unavailable');await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByRole('heading',{name:'No matching listings.'}).waitFor();
  assert.ok(statusRequests<=2,'No recurring launch polling in live application');
  await page.goto(`${origin}/app/orders`);await page.getByRole('heading',{name:'Your commerce, in one place.'}).waitFor();
  await f.db.query('UPDATE configuration SET maintenance=true WHERE id=1');
  await page.goto(`${origin}/app`);
  await page.getByText('Scheduled commerce. Paused for maintenance.').waitFor();
  assert.deepEqual(errors,[]);
});

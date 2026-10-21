let statusSnapshot;
let sampledAt;
let timer;
let failures = 0;
let running = false;
const $ = id => document.getElementById(id);
function drawCountdown() {
  if (!statusSnapshot || statusSnapshot.status !== 'PRE_LAUNCH') return;
  // Monotonic elapsed time from the trusted server sample; never use the visitor's Date.now().
  const remaining = Math.max(0,Math.ceil((Date.parse(statusSnapshot.launchAt)-Date.parse(statusSnapshot.serverTime)-(performance.now()-sampledAt))/1000));
  const parts=[Math.floor(remaining/86400),Math.floor(remaining%86400/3600),Math.floor(remaining%3600/60),remaining%60];
  $('countdown').replaceChildren(...parts.map((value,index)=>{
    const block=document.createElement('div'); const strong=document.createElement('strong'); const label=document.createElement('span');
    strong.textContent=String(value).padStart(2,'0'); label.textContent=['DAYS','HOURS','MINUTES','SECONDS'][index]; block.append(strong,label); return block;
  }));
}
async function checkStatus() {
  if (running) return;
  running=true; clearTimeout(timer); $('retry-status').hidden=true;
  try {
    const response=await fetch('/api/launch-status',{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Status unavailable');
    statusSnapshot=await response.json(); sampledAt=performance.now(); failures=0;
    const state=statusSnapshot;
    $('nav-status').textContent=state.status.replaceAll('_',' ');
    $('launch-time').dateTime=state.launchAt;
    $('launch-time').textContent=`Scheduled launch · ${new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'long',timeZone:'UTC'}).format(new Date(state.launchAt))}`;
    $('countdown').hidden=state.status!=='PRE_LAUNCH';
    $('enter-app').hidden=!state.available;
    if (state.available) {
      $('launch-label').textContent='Commerce is open';
      $('launch-description').textContent='Explore the available catalog and your Paynexis account.';
      window.location.replace('/app'); return;
    }
    $('launch-label').textContent=state.status==='PRE_LAUNCH'?'The next chapter begins soon':state.status==='MAINTENANCE'?'Scheduled commerce. Paused for maintenance.':'Launch time reached · service unavailable';
    $('launch-description').textContent=state.status==='PRE_LAUNCH'?'The application opens automatically at the scheduled UTC launch time.':state.message;
    drawCountdown();
    const remaining=Date.parse(state.launchAt)-Date.parse(state.serverTime);
    timer=setTimeout(checkStatus,state.status==='PRE_LAUNCH'?Math.max(250,Math.min(15000,remaining)):30000);
  } catch {
    failures++;
    $('nav-status').textContent='Status unavailable'; $('launch-label').textContent='Unable to confirm availability';
    $('launch-description').textContent='The connection to Paynexis could not be verified. Please try again.';
    $('countdown').hidden=true; $('enter-app').hidden=true; $('retry-status').hidden=false;
    if (failures<6) timer=setTimeout(checkStatus,Math.min(30000,2000*2**failures));
  } finally { running=false; }
}
$('retry-status').addEventListener('click',()=>{failures=0;checkStatus();});
document.addEventListener('visibilitychange',()=>{if (!document.hidden) checkStatus();});
window.addEventListener('online',checkStatus);
setInterval(drawCountdown,1000);
checkStatus();

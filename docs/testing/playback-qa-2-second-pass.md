# QA2 second browser attempt: shell ready, baseline incomplete

Actual dispatch-built app:1b3ef49c,version1834b6a9. QA source HEAD at execution:c5818cfe67c2f986138e8322951d99bcb94a5c47.
Authoritative browser grant15:24:20.735Z,consumed15:24:27Z; START15:26:26Z before browser/server launch.
Prior blocker/asset docs submission25942a15 landed1b3ef49c at15:22:48.832Z; durable status verified.

Fresh own frozen snapshot822 files,manifest SHA256662fa755e3cde021058f5bf9a5bd2825698bad064ab80472a5ba70e651d764b1;
index5095c3f1326b035ef93267ad77663ea641edb1acaae6d18e88085eff08c5d6d3,
CSS283d04642d201edba1e9bd5cbc3ede8d74fbd11b50ff0cd2732d463847d2adf3.
Copied integrated r2Service bytes matched merged current source, SHA2564719aecfeae3355a7dc933eec0d55d2e664e427bf425dedf7d3bd324dd682658.
Real pinned Buffer ESM65405 bytes,SHA256507a593508c51d1397a9a5818ad0b8dbf7e3ad810feaa87cabff87ff56cf3984;
local fulfillment occurred exactly once at its original CDN import URL. No other non-local request was permitted.
This remains a genuine npm-source repackaging,not byte-identical CDN/transitive resolution or production-offline proof.

## Measured result and driver intervention

`node /tmp/bitvid-playback-qa-2-integrated/controller.mjs` in a non-PTY exec session: exit0,
15:26:29.558→15:26:32.207Z (2.649s),Chromium154.0.8037.97,360×800.
App harness object,actual getApplication() object and visible video-list became ready. Initial emitted BOOTED/boot=passed
meant these three readiness checks only; it **does not mean baseline passed**. The retained report corrects that label to
shell-and-harness-ready-only/INCOMPLETE. Actual page body:Trending/No public videos available yet/footer version1834b6a9.
No pageerror or local404. Guard blocked10 non-local HTTP attempts(AWS SDK and parallel Nostr fallback imports),0 non-localWS.
These attempts alone do not establish a hard boot blocker:the bootstrap also tries the existing real local Nostr bundle.
No later toolkit readiness or seeded-card hydration was measured before closure.

The runner's interactive stdin was immediately EOF in the non-PTY tool session. Its for-await command loop ended,
then finally closed all resources before any planned UI actions ran. `actions=[]`. This is an avoidable runner mistake,
not a demonstrated app defect. No second-attempt screenshot was captured; the first-attempt screenshot documents only
its unstyled source-checkout blocker and must not stand in for this integrated snapshot.

Browser/context/app31847+existing mockrelay31848/31849 closed15:26:32.207Z;explicit RELEASE/intervention reported
15:27:26Z. Own temporary dependency symlink removed;preview3000 and other processes untouched. This pass seeded only3
synthetic local video events with real test-key signing through the existing mockrelay API;no production identity/signing,
real media,peers,buckets or outgoing external publishing. Their appearance in the feed was not verified.

## Unverified work and concrete correction

390×844/1280×720,3-card hydration,navigation,Profile/Upload interactions,required-field validation,touch controls,
focus and overflow remain unverified. Do not classify parallel blocked imports as a product regression without observation.
Concrete runner correction: use the same isolated controller in a PTY(`tty:true`) so stdin remains available;
wait for actual seeded-card/toolkit readiness,then execute bounded UI actions. Requires dispatch resumption/browser grant.
No further browser/build/asset mirroring/product changes have been performed under this note.

## Saved report

```json
{
  "started": "2026-10-20T15:26:29.558Z",
  "mirrorHits": [
    "https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm"
  ],
  "blockedHttp": [
    "https://esm.sh/@aws-sdk/client-s3@3.637.0?bundle",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/+esm",
    "https://esm.sh/nostr-tools@2.17.0",
    "https://esm.sh/nostr-tools@2.17.0?target=es2022&exports=nip04",
    "https://esm.sh/nostr-tools@2.17.0/nip44?target=es2022",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js"
  ],
  "blockedWs": [],
  "failedLocal": [],
  "pageErrors": [],
  "consoleErrors": [
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector"
  ],
  "actions": [],
  "browserVersion": "154.0.8037.97",
  "boot": "shell-and-harness-ready-only",
  "ended": "2026-10-20T15:26:32.207Z",
  "resourcesClosed": true,
  "baseline": "INCOMPLETE",
  "driverIssue": "stdin EOF closed interactive controller before any actions; not a demonstrated app blocker"
}
```

## Exact controller used (non-PTY invocation caused early EOF)

```js
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {chromium} from '/home/user/Documents/GitHub/bitvid/node_modules/playwright/index.mjs';
import {startRelay} from '/home/user/Documents/GitHub/bitvid-playback-qa/scripts/agent/simple-relay.mjs';
const require=createRequire('/home/user/Documents/GitHub/bitvid/package.json');
const {finalizeEvent}=require('nostr-tools');
const base='/tmp/bitvid-playback-qa-2-integrated',root=base+'/dist';
const evidence='/home/user/Documents/GitHub/bitvid-playback-qa/docs/testing';
const report={started:new Date().toISOString(),mirrorHits:[],blockedHttp:[],blockedWs:[],failedLocal:[],pageErrors:[],consoleErrors:[],actions:[]};
const sk=new Uint8Array(32).fill(0x7b);
const server=createServer(async(req,res)=>{
 let path=decodeURIComponent(new URL(req.url,'http://127.0.0.1:31847').pathname);if(path==='/')path='/index.html';const f=resolve(root,'.'+path);
 if(!f.startsWith(root+'/')||path.includes('/.')){res.writeHead(404);res.end();return;}
 try{const b=await readFile(f);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(f)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404);res.end();}
});
let browser,relay,context,page,closed=false;
async function finish(){if(closed)return;closed=true;if(context)await context.close();if(browser)await browser.close();if(relay)await relay.close();await new Promise(ok=>server.close(ok));report.ended=new Date().toISOString();report.resourcesClosed=true;await writeFile(base+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify({type:'CLOSED',ended:report.ended,mirrorHits:report.mirrorHits.length,blockedHttp:report.blockedHttp,blockedWs:report.blockedWs,failedLocal:report.failedLocal,pageErrors:report.pageErrors}));}
try{
 await new Promise((ok,no)=>{server.once('error',no);server.listen(31847,'127.0.0.1',ok);});
 relay=startRelay(31848,{httpPort:31849});
 for(let i=0;i<3;i++){const title=i===0?'QA local synthetic video with a deliberately long title to inspect narrow-card wrapping and controls':'QA local synthetic video '+i;relay.seedEvent(finalizeEvent({kind:30078,created_at:Math.floor(Date.now()/1000)-i,tags:[['d','qa2-'+i],['t','video'],['title',title],['url','http://127.0.0.1:31847/qa2-unplayed.webm']],content:JSON.stringify({version:3,title,url:'http://127.0.0.1:31847/qa2-unplayed.webm',videoRootId:'qa2-'+i,mode:'dev',isPrivate:false,deleted:false})},sk));}
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});report.browserVersion=browser.version();
 context=await browser.newContext({viewport:{width:360,height:800},serviceWorkers:'block'});
 const mirror=await readFile(base+'/buffer-6.0.3-local.mjs');
 await context.route('**/*',r=>{const url=r.request().url();if(url==='https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm'){report.mirrorHits.push(url);return r.fulfill({body:mirror,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}});}const u=new URL(url);if(['127.0.0.1','localhost','[::1]'].includes(u.hostname))return r.continue();report.blockedHttp.push(url);return r.abort('blockedbyclient');});
 await context.routeWebSocket('**/*',ws=>{const u=new URL(ws.url());if(['127.0.0.1','localhost','[::1]'].includes(u.hostname))ws.connectToServer();else{report.blockedWs.push(ws.url());ws.close();}});
 await context.addInitScript(()=>{localStorage.setItem('hasSeenDisclaimer','true');localStorage.setItem('__bitvidTestMode__','1');localStorage.setItem('__bitvidTestRelays__',JSON.stringify(['ws://127.0.0.1:31848']));window.__bitvidTestRelays__=['ws://127.0.0.1:31848'];localStorage.setItem('bitvid_admin_whitelist_mode','false');});
 page=await context.newPage();page.setDefaultTimeout(10000);
 page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text().slice(0,700));});page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).hostname==='127.0.0.1')report.failedLocal.push({url:r.url(),status:r.status()});});
 await page.goto('http://127.0.0.1:31847/?__test__=1&__testRelays__=ws%3A%2F%2F127.0.0.1%3A31848',{waitUntil:'domcontentloaded'});
 try{await page.waitForFunction(()=>typeof window.__bitvidTest__==='object',null,{timeout:15000});await page.waitForFunction(async()=>{const m=await import('/js/applicationContext.js');return !!m.getApplication();},null,{timeout:15000});await page.locator('[data-testid="video-list"]').waitFor({state:'visible',timeout:15000});report.boot='passed';console.log(JSON.stringify({type:'BOOTED',viewport:{width:360,height:800},body:(await page.locator('body').innerText()).slice(0,3000)}));}
 catch(e){report.boot='blocked';report.bootError=e.message;await page.screenshot({path:evidence+'/playback-qa-2-second-boot-blocker.png',fullPage:true});console.log(JSON.stringify({type:'BLOCKED',error:e.message,body:(await page.locator('body').innerText()).slice(0,1500)}));await finish();process.exit(0);}
 const lines=createInterface({input:process.stdin});
 for await(const line of lines){if(!line.trim())continue;try{const c=JSON.parse(line);let result;
  if(c.type==='done'){report.actions.push(c);await finish();break;}
  if(c.type==='eval'){const fn=Function('return ('+c.script+')')();result=await page.evaluate(fn,c.arg);}
  if(c.type==='click'){await page.locator(c.selector).click();result='clicked';}
  if(c.type==='fill'){await page.locator(c.selector).fill(c.value);result='filled';}
  if(c.type==='press'){await page.keyboard.press(c.key);result='pressed';}
  if(c.type==='viewport'){await page.setViewportSize(c.viewport);result=c.viewport;}
  if(c.type==='screenshot'){await page.screenshot({path:evidence+'/'+c.name,fullPage:true});result=c.name;}
  if(c.type==='wait'){await page.locator(c.selector).waitFor({state:c.state||'visible',timeout:c.timeout||10000});result='ready';}
  report.actions.push({at:new Date().toISOString(),command:c,result});console.log(JSON.stringify({type:'RESULT',id:c.id,result}));
 }catch(e){report.actions.push({error:e.message});console.log(JSON.stringify({type:'ACTION_ERROR',error:e.message}));}}
 await finish();
}catch(e){report.runError=e.stack;console.log(JSON.stringify({type:'ERROR',error:e.stack}));await finish();process.exitCode=1;}
```

A browser-free PTY stdin handshake was independently checked after the driver failure:
Node printed PTY_READY and stayed running; a later write_stdin sent qa2-driver-ack;
process printed PTY_HANDSHAKE_PASS and exited0. This verifies the proposed terminal transport correction
without opening another browser/server or changing app behavior. It is not a resumed UI baseline.

## Noninteractive correction prepared under interpreter hold

Interpreter15:30:06 confirms history/client6 owns full/browser resource; no browser/server/build may launch
until dispatch explicitly grants the next attempt after release. Only read-only scratch preparation performed.
The corrected runner removes stdin entirely, has a120s resource-cleaning hard deadline and existing bounded
locator/card-readiness waits. It requires real toolkit readiness(no __TEST_MODE__ mock flag),exactly3 synthetic
relay video cards,then test-only login through the unchanged harness. For each360×800/390×844/1280×720 viewport:
actual Trending/Explore/ForYou link routing; feed/card/document width observations; Profile open→6Tab focus containment
→close→trigger focus restoration; Upload external-link mode open→native missing-title validity→title-only missing
source error→no additional kind30078 video published→close/focus restoration. It captures feed/profile/validation
screenshots,small-control dimensions against44px as observations only,and all network guard outcomes.
No source/toolkit/crypto override,new public resource mirror,or expectation change. Syntax-check exit0 only;
**none of these prepared UI actions has yet been executed**. First unavailable prerequisite or failed assertion
stops this pass and captures evidence; no retry/sleep masking. Guard and genuine Buffer/artifact pins unchanged.
The per-validation publication check counts video events specifically,excluding unrelated asynchronous list events.

Dispatch15:30:36 explicitly approved the same own-scratch noninteractive correction only,while client6 holds
full/browser. Final browser requires a later explicit grant and runtime diff check after test-only history landing.
Prepared runner SHA256:`f60065c2a45b4b20485acaecd91bc5c5c937069cea4db095727c2838895588e0`.
Exact prepared source below is evidence,not a registered/retained test or a claim of successful UI execution.

```js
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {chromium} from '/home/user/Documents/GitHub/bitvid/node_modules/playwright/index.mjs';
import {startRelay} from '/home/user/Documents/GitHub/bitvid-playback-qa/scripts/agent/simple-relay.mjs';
const require=createRequire('/home/user/Documents/GitHub/bitvid/package.json');
const {finalizeEvent}=require('nostr-tools');
const base='/tmp/bitvid-playback-qa-2-integrated',root=base+'/dist';
const evidence='/home/user/Documents/GitHub/bitvid-playback-qa/docs/testing';
const report={driver:'noninteractive bounded actions',started:new Date().toISOString(),mirrorHits:[],blockedHttp:[],blockedWs:[],failedLocal:[],pageErrors:[],consoleErrors:[],actions:[]};
const sk=new Uint8Array(32).fill(0x7b);
const server=createServer(async(req,res)=>{
 let path=decodeURIComponent(new URL(req.url,'http://127.0.0.1:31847').pathname);if(path==='/')path='/index.html';const f=resolve(root,'.'+path);
 if(!f.startsWith(root+'/')||path.includes('/.')){res.writeHead(404);res.end();return;}
 try{const b=await readFile(f);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(f)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404);res.end();}
});
let browser,relay,context,page,closed=false,hardDeadline;
async function finish(){if(closed)return;closed=true;clearTimeout(hardDeadline);if(context)await context.close();if(browser)await browser.close();if(relay)await relay.close();await new Promise(ok=>server.close(ok));report.ended=new Date().toISOString();report.resourcesClosed=true;await writeFile(base+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify({type:'CLOSED',ended:report.ended,mirrorHits:report.mirrorHits.length,blockedHttp:report.blockedHttp,blockedWs:report.blockedWs,failedLocal:report.failedLocal,pageErrors:report.pageErrors}));}
hardDeadline=setTimeout(()=>{report.deadlineFailure='120s bounded runner deadline';void finish().finally(()=>process.exit(1));},120000);
try{
 await new Promise((ok,no)=>{server.once('error',no);server.listen(31847,'127.0.0.1',ok);});
 relay=startRelay(31848,{httpPort:31849});
 for(let i=0;i<3;i++){const title=i===0?'QA local synthetic video with a deliberately long title to inspect narrow-card wrapping and controls':'QA local synthetic video '+i;relay.seedEvent(finalizeEvent({kind:30078,created_at:Math.floor(Date.now()/1000)-i,tags:[['d','qa2-'+i],['t','video'],['title',title],['url','http://127.0.0.1:31847/qa2-unplayed.webm']],content:JSON.stringify({version:3,title,url:'http://127.0.0.1:31847/qa2-unplayed.webm',videoRootId:'qa2-'+i,mode:'dev',isPrivate:false,deleted:false})},sk));}
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});report.browserVersion=browser.version();
 context=await browser.newContext({viewport:{width:360,height:800},serviceWorkers:'block'});
 const mirror=await readFile(base+'/buffer-6.0.3-local.mjs');
 await context.route('**/*',r=>{const url=r.request().url();if(url==='https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm'){report.mirrorHits.push(url);return r.fulfill({body:mirror,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}});}const u=new URL(url);if(['127.0.0.1','localhost','[::1]'].includes(u.hostname))return r.continue();report.blockedHttp.push(url);return r.abort('blockedbyclient');});
 await context.routeWebSocket('**/*',ws=>{const u=new URL(ws.url());if(['127.0.0.1','localhost','[::1]'].includes(u.hostname))ws.connectToServer();else{report.blockedWs.push(ws.url());ws.close();}});
 await context.addInitScript(()=>{localStorage.setItem('hasSeenDisclaimer','true');localStorage.setItem('__bitvidTestMode__','1');localStorage.setItem('__bitvidTestRelays__',JSON.stringify(['ws://127.0.0.1:31848']));window.__bitvidTestRelays__=['ws://127.0.0.1:31848'];localStorage.setItem('bitvid_admin_whitelist_mode','false');});
 page=await context.newPage();page.setDefaultTimeout(10000);
 page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text().slice(0,700));});page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).hostname==='127.0.0.1')report.failedLocal.push({url:r.url(),status:r.status()});});
 await page.goto('http://127.0.0.1:31847/?__test__=1&__testRelays__=ws%3A%2F%2F127.0.0.1%3A31848',{waitUntil:'domcontentloaded'});
 try{await page.waitForFunction(()=>typeof window.__bitvidTest__==='object',null,{timeout:15000});await page.waitForFunction(async()=>{const m=await import('/js/applicationContext.js');return !!m.getApplication();},null,{timeout:15000});await page.locator('[data-testid="video-list"]').waitFor({state:'visible',timeout:15000});report.boot='passed';console.log(JSON.stringify({type:'BOOTED',viewport:{width:360,height:800},body:(await page.locator('body').innerText()).slice(0,3000)}));}
 catch(e){report.boot='blocked';report.bootError=e.message;await page.screenshot({path:evidence+'/playback-qa-2-second-boot-blocker.png',fullPage:true});console.log(JSON.stringify({type:'BLOCKED',error:e.message,body:(await page.locator('body').innerText()).slice(0,1500)}));await finish();process.exit(0);}

 // Noninteractive: no stdin/readline loop; each action is awaited exactly once.
 const check=(condition,message)=>{if(!condition)throw new Error(message);};
 const step=async(name,action)=>{const item={name,at:new Date().toISOString()};report.actions.push(item);try{item.result=await action();item.ok=true;console.log(JSON.stringify({type:'STEP',name,ok:true,result:item.result}));return item.result;}catch(e){item.ok=false;item.error=e.message;console.log(JSON.stringify({type:'STEP',name,ok:false,error:e.message}));throw e;}};
 const capture=async(name)=>{await page.screenshot({path:evidence+'/'+name,fullPage:true});report.actions.push({screenshot:name});};
 const layout=async()=>page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,cardBounds:[...document.querySelectorAll('[data-testid="video-card"]')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width};}),smallControls:[...document.querySelectorAll('button,a,input')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>{const r=e.getBoundingClientRect();return {id:e.id,label:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,80),width:r.width,height:r.height};}).filter(x=>x.width>0&&x.height>0&&(x.width<44||x.height<44))}));
 const modalFocus=async(root)=>{const samples=[];for(let i=0;i<6;i++){await page.keyboard.press('Tab');samples.push(await page.evaluate(selector=>{const el=document.activeElement;return {inside:!!document.querySelector(selector)?.contains(el),id:el?.id,tag:el?.tagName,outline:getComputedStyle(el).outlineStyle,shadow:getComputedStyle(el).boxShadow};},root));}check(samples.every(x=>x.inside),'keyboard focus escaped '+root);return samples;};
 try{
  await step('actual toolkit ready',async()=>{const ready=await page.evaluate(async()=>{const m=await import('/js/nostrToolsBootstrap.js');const r=await m.nostrToolsReady;return {ok:r?.ok,reason:r?.reason,mockFlag:!!window.__TEST_MODE__};});check(ready.ok===true&&!ready.mockFlag,'real toolkit unavailable: '+JSON.stringify(ready));return ready;});
  await step('three synthetic relay cards hydrate',async()=>{await page.evaluate(()=>window.__bitvidTest__.waitForFeedItems(3,15000));const items=await page.evaluate(()=>window.__bitvidTest__.getFeedItems());check(items.length===3,'expected exactly3 local cards,got'+items.length);return items.map(x=>({title:x.title,dTag:x.dTag}));});
  await step('local test identity login',async()=>{await page.evaluate(()=>window.__bitvidTest__.loginWithNsec('7b'.repeat(32)));await page.locator('[data-testid="profile-button"]').waitFor({state:'visible'});await page.locator('[data-testid="upload-button"]').waitFor({state:'visible'});return {profileVisible:true,uploadVisible:true};});
  for(const viewport of [{width:360,height:800},{width:390,height:844},{width:1280,height:720}]){
   await page.setViewportSize(viewport);const prefix=String(viewport.width);
   await step(prefix+' trending navigation/feed',async()=>{await page.locator('#trendingLink').click();await page.waitForFunction(()=>location.hash.includes('view=trending'));await page.evaluate(()=>window.__bitvidTest__.waitForFeedItems(3,15000));const r=await layout();check(r.documentWidth<=r.width,'horizontal document overflow');check(r.cardBounds.every(x=>x.x>=0&&x.right<=r.width),'card extends beyond viewport');return r;});
   await capture('playback-qa-2-'+prefix+'-feed.png');
   for(const [id,view] of [['#exploreLink','explore'],['#forYouLink','for-you'],['#trendingLink','trending']])await step(prefix+' navigation '+view,async()=>{await page.locator(id).click();await page.waitForFunction(v=>location.hash.includes('view='+v),view);return {hash:await page.evaluate(()=>location.hash),headings:await page.locator('h1,h2').allTextContents()};});
   await step(prefix+' Profile open/focus/close',async()=>{await page.locator('[data-testid="profile-button"]').click();await page.locator('#profileModal').waitFor({state:'visible'});const focus=await modalFocus('#profileModal');await capture('playback-qa-2-'+prefix+'-profile.png');await page.locator('#closeProfileModal').click();await page.locator('#profileModal').waitFor({state:'hidden'});const restored=await page.evaluate(()=>document.activeElement?.id);check(restored==='profileButton','Profile close did not restore trigger focus');return {focus,restored};});
   await step(prefix+' Upload required fields/focus/close',async()=>{const videoCount=()=>[...relay.getEvents().values()].filter(e=>e.kind===30078).length;const before=videoCount();await page.locator('[data-testid="upload-button"]').click();await page.locator('#uploadModal').waitFor({state:'visible'});await page.locator('#btn-mode-external').click();const focus=await modalFocus('#uploadModal');await page.locator('#input-title').fill('');await page.locator('#input-url').fill('');await page.locator('#input-magnet').fill('');await page.locator('#btn-submit').click();const missingTitle=await page.locator('#input-title').evaluate(e=>e.validity.valueMissing);check(missingTitle,'empty title not rejected by native validation');await page.locator('#input-title').fill('QA invalid local form');await page.locator('#btn-submit').click();await page.waitForFunction(()=>document.querySelector('#errorContainer')?.textContent.includes('Please provide at least a Video URL or Magnet Link.'));check(videoCount()===before,'invalid form published video event');await capture('playback-qa-2-'+prefix+'-upload-validation.png');const l=await layout();check(l.documentWidth<=l.width,'Upload horizontal document overflow');await page.locator('#closeUploadModal').click();await page.locator('#uploadModal').waitFor({state:'hidden'});const restored=await page.evaluate(()=>document.activeElement?.id);check(restored==='uploadButton','Upload close did not restore trigger focus');return {focus,missingTitle,noSourceRejected:true,noRelayPublish:true,restored,layout:l};});
  }
  report.baseline='completed';
 }catch(e){report.baseline='blocked-or-failed';report.failedStep=report.actions.findLast(x=>x.ok===false)?.name;report.failure=e.message;await capture('playback-qa-2-resumed-stop.png');}
 await finish();
}catch(e){report.runError=e.stack;console.log(JSON.stringify({type:'ERROR',error:e.stack}));await finish();process.exitCode=1;}
```

## Genuine media fixture preflight (no browser/server launch)

Interpreter15:36:55 correctly identified that all3 synthetic notes referenced absent `/qa2-unplayed.webm`.
This was fixture incompleteness,not a reproduced app defect. Provisioned only own scratch,not frozen dist/product:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=blue:s=64x64:r=10 -t 2 -an -c:v libvpx -y /tmp/bitvid-playback-qa-2-integrated/fixtures/qa2-unplayed.webm
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=codec_name,width,height,nb_read_frames -of json /tmp/bitvid-playback-qa-2-integrated/fixtures/qa2-unplayed.webm
```

ffmpeg6.1.1-3ubuntu5; genuine generated VP8,64×64,2.000s,1019 bytes; ffprobe read20 frames,exit0.
Actual fixture SHA256:`d911005a5bca7fb1f3e5aa2fbee701b6476c9baf93460264c2aa5105dd0b3c69`.
No source media downloaded/copied from another user. The generation recipe fixes content,not necessarily container
random identifiers across regenerated files;this exact frozen input is pinned by its measured hash. No product build ran.

Standalone own media handler serves exact path before static-file lookup,with video/webm/Content-Length/Accept-Ranges:
HEAD200,no body;GET200,full genuine bytes;single prefix/open/suffix Range206 with exact bytes/Content-Range;
unsatisfiable416;unsupported method405. In-memory contract preflight7/7,exit0. Three own-scratch broken variants
(wrong Content-Length,truncated GET,ignored Range) each exited1; originals restored and7/7 passed again.
No socket/browser/server was started. These checks validate fixture IO,not app/controller behavior or native-browser playback.

The next explicitly granted run includes real local HTTP HEAD/GET/Range checks **before** opening Chromium.
No response/app/controller state is faked. All822 frozen app file hashes rechecked unchanged;future runner also
verifies the manifest and every file plus exact media hash before opening a server. Existing real Buffer/external-deny
guard and3-card/UI assertions retained. ForYou/Explore remain observed through real post-login visibility;no forced clicks.

Input data:3 actual signed synthetic kind30078 notes from existing fixture test identity,local URL only,one deliberately
long title for narrow-card wrapping. No valid publication is attempted;invalid Upload submissions must not add a video
event. Local media does not qualify HTTPS/CORS,live peers or production content playback.

Updated prepared runner SHA256:`dc10bf51310ea0c2138367219f28212471c994efab2886ed35eb6fd10e874ad7`.
Prior f60065c2 source above is historical;current difference is standalone genuine fixture transport+wire preflight+
stronger snapshot/input pins only. `node --check` exit0;UI sequence still unexecuted pending dispatch grant.

Exact standalone handler:

```js
import {createHash} from 'node:crypto';
export function mediaResponse(method, range, bytes) {
 const length=bytes.length;
 const headers={'Content-Type':'video/webm','Content-Length':String(length),'Accept-Ranges':'bytes','ETag':'"'+createHash('sha256').update(bytes).digest('hex')+'"'};
 if(!['GET','HEAD'].includes(method))return {status:405,headers:{Allow:'GET, HEAD','Content-Length':'0'},body:null};
 if(method==='HEAD')return {status:200,headers,body:null};
 if(!range)return {status:200,headers,body:bytes};
 const m=/^bytes=(\d*)-(\d*)$/.exec(range);
 let start,end;
 if(m&&(m[1]||m[2])){
  if(!m[1]){const suffix=Number(m[2]);if(suffix>0){start=Math.max(0,length-suffix);end=length-1;}}
  else {start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),length-1):length-1;}
 }
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=length||end<start)return {status:416,headers:{'Content-Range':`bytes */${length}`,'Content-Length':'0'},body:null};
 return {status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${length}`},body:bytes.subarray(start,end+1)};
}
```

Exact socket-free preflight:

```js
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mediaResponse} from './media-fixture.mjs';
const bytes=await readFile(new URL('./fixtures/qa2-unplayed.webm',import.meta.url));
const head=mediaResponse('HEAD',null,bytes);assert.equal(head.status,200);assert.equal(head.headers['Content-Type'],'video/webm');assert.equal(head.headers['Content-Length'],String(bytes.length));assert.equal(head.body,null);
const get=mediaResponse('GET',null,bytes);assert.equal(get.status,200);assert.deepEqual(get.body,bytes);assert.equal(get.headers['Content-Length'],String(bytes.length));
for(const [range,start,end] of [['bytes=0-31',0,31],['bytes=32-',32,bytes.length-1],['bytes=-16',bytes.length-16,bytes.length-1]]){const r=mediaResponse('GET',range,bytes);assert.equal(r.status,206);assert.equal(r.headers['Content-Range'],`bytes ${start}-${end}/${bytes.length}`);assert.equal(r.headers['Content-Length'],String(end-start+1));assert.deepEqual(r.body,bytes.subarray(start,end+1));}
const bad=mediaResponse('GET','bytes=999999-',bytes);assert.equal(bad.status,416);assert.equal(bad.headers['Content-Range'],`bytes */${bytes.length}`);assert.equal(bad.body,null);
const method=mediaResponse('POST',null,bytes);assert.equal(method.status,405);assert.equal(method.body,null);
console.log('local media fixture preflight7/7 pass (HEAD,GET,3ranges,416,405), no sockets');
```

## Final-grant attempt and authorized runner contract correction

Explicit dispatch grant15:44:58.082Z,START15:45:33 before launch.
Run15:45:39.511→15:45:46.059Z (6.548s),Chromium154.0.8037.97:actual local fixture wire
HEAD200/GET200(1019 genuine bytes)/Range206 all passed. Buffer mirror1hit,local404=0,pageerror=0,externalguardunchanged.
Stopped first readiness assertion;no3-card/login/UI actions executed. Screenshot:playback-qa-2-resumed-stop.png.

Avoidable scratch-contract error: runner asserted `(await nostrToolsReady).ok === true`. Actual source
`js/nostrToolsBootstrap.js` success returns `frozenCanonical` (toolkit),while failure returns `{ok:false,...}`.
This is **not a demonstrated app/toolkit defect**. Original exact failed source/report retained in own scratch
noninteractive-attempt-3.mjs/attempt-3-result.json;baseline remains incomplete. All owned resources closed15:45:46.059Z,
RELEASE/intervention sent15:46:53Z. No retries or false app-success claim.

Interpreter15:46:29 and dispatch15:47:12 explicitly authorized only this scratch specification correction and one
bounded rerun after cheap offline proof. Corrected equally stronger check requires:actual returned toolkit callable
getPublicKey/finalizeEvent/verifyEvent;identity with immutable canonical global;no mock flag;Node-signed seeded
event verifies;independent tampered event rejects;synthetic key derives expected pubkey;browser-produced signature
independently verifies with Node's real nostr-tools. No application/toolkit/crypto methods are replaced.
All3-card/UI assertions and genuine fixture/artifact/traffic pins remain unchanged.

Offline proof evaluated the genuine unchanged vendored bundle in a Node vm:callable APIs/sign/verify/tampered rejection/
pubkey match/independent Node verification6/6,exit0. Initial vm-preflight plumbing required a newline after the bundle
sourceMappingURL comment and creating challenge events in that vm's own realm;those probe setup errors were corrected
without library/app mutation. This proof does not qualify browser loader/global identity until actual run.
Prepared corrected runner SHA256731cc9073f3c6594fa2b77735cac34415f1f034729c2dc48dd3b5bf702592864,syntax-check0.

```yaml
test_integrity_note:
  change_type: ["spec_correction"]
  scope: "own scratch runner only; no registered test or product change"
  scenarios:
    - id: SCN-QA2-real-toolkit-readiness
      given: "actual bootstrap resolves its frozen canonical toolkit, or an explicit failure"
      when: "baseline checks readiness before real UI actions"
      then: "require canonical real callable APIs and positive/negative synthetic cryptographic proofs"
  observable_outcomes:
    - "valid event verifies, tampered event rejects, actual generated signature independently verifies"
  determinism_controls: ["fixed synthetic key/event; genuine vendored toolkit; no network or stubs"]
  anti_cheat_rationale:
    prevents: ["always-true verifier", "no-op signer", "mock toolkit mistaken for readiness"]
  relaxation:
    did_relax_any_assertion: true
    if_true_explain_spec_basis: "Replaced invalid ok:true envelope assumption with source-defined actual toolkit contract and stronger crypto proofs; UI assertions unchanged."
```

## Corrected cryptographic readiness passed; zero-card setup failure

Dispatch15:47:12 approved corrected bounded rerun;START15:49:25 before launch.
Run15:49:29.399→15:49:48.277Z (18.878s),real local media wire200/200/206 passed,real canonical toolkit checks
all passed(including browser-produced signature independently verified). Next documented harness prerequisite
`waitForFeedItems(3,15000)` failed with0 cards. No login/navigation/modal/390/1280 checks executed.
Owned resources closed15:49:48.277Z;explicit RELEASE sent15:50:24Z. No app defect attribution or relaxed count/timeout.

Read-only source-backed setup gaps identified under dispatch15:50:54 route: `js/index.js:startApplication` assigns
`setApplication(application)` before awaiting `application.init()`/`application.start()`. Previous runner waited
for instance presence only;actual exported `getApplicationReady()` is the startup-completion boundary.
Also existing fixture explicitly reapplies `setTestRelays` after harness installation;runner relied only on initial
query/storage/install override. Install itself applies overrides,so absence of reapply is not claimed as sole cause.
Earlier seed-mode dev/live speculation was not supported by an observed filtering rule and is NOT attributed.

Cheap socket-free source ordering3/3 and genuine synthetic signature/filter match3/3 passed. Source subscription
filter kinds30078/#tvideo matches all3 inputs. This verifies fixture input/filter compatibility,not full-app hydration.
Routine authorized correction only awaits the real exported ready promise with15s bound and invokes existing
fixture relay API after readiness. Exact3-card count and15s card timer,UI assertions,artifact/fixture/Buffer pins
and external deny guard remain unchanged. Read-only failure diagnostics add actual relay health/feed count/body.
Source gap is proven;whether it caused the previous0 cards is not claimed without the next measured result.
Corrected prepared driver8fb7bad44a79bf4abfe9d7b4febdb64cc30dad30e78c2cd18dbb9da94c01f6dd,syntax0.

Saved zero-card result:

```json
{
  "driver": "noninteractive bounded actions",
  "started": "2026-10-20T15:49:29.399Z",
  "mirrorHits": [
    "https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm"
  ],
  "blockedHttp": [
    "https://esm.sh/@aws-sdk/client-s3@3.637.0?bundle",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/+esm",
    "https://esm.sh/nostr-tools@2.17.0",
    "https://esm.sh/nostr-tools@2.17.0?target=es2022&exports=nip04",
    "https://esm.sh/nostr-tools@2.17.0/nip44?target=es2022",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js"
  ],
  "blockedWs": [],
  "failedLocal": [],
  "pageErrors": [],
  "consoleErrors": [
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector"
  ],
  "actions": [
    {
      "name": "actual toolkit ready",
      "at": "2026-10-20T15:49:32.995Z",
      "result": {
        "callable": true,
        "canonicalIdentity": true,
        "frozen": true,
        "mockFlag": false,
        "validSeed": true,
        "tamperedRejected": true,
        "pubkeyMatches": true,
        "independentSignatureVerified": true
      },
      "ok": true
    },
    {
      "name": "three synthetic relay cards hydrate",
      "at": "2026-10-20T15:49:33.045Z",
      "ok": false,
      "error": "page.evaluate: Error: [testHarness] Timed out waiting for 3 feed items (found 0)\n    at check (http://127.0.0.1:31847/js/testHarness.js:571:11)"
    },
    {
      "screenshot": "playback-qa-2-resumed-stop.png"
    }
  ],
  "fixtureHttp": {
    "head": 200,
    "get": 200,
    "range": 206,
    "bytes": 1019,
    "contentType": "video/webm"
  },
  "browserVersion": "154.0.8037.97",
  "boot": "passed",
  "baseline": "blocked-or-failed",
  "failedStep": "three synthetic relay cards hydrate",
  "failure": "page.evaluate: Error: [testHarness] Timed out waiting for 3 feed items (found 0)\n    at check (http://127.0.0.1:31847/js/testHarness.js:571:11)",
  "ended": "2026-10-20T15:49:48.277Z",
  "resourcesClosed": true
}
```

## Startup-complete correction measured: still zero cards

Dispatch15:54:23 confirmed conditional route;START15:54:58 before browser.
Actual run15:55:01.326→15:55:18.667Z (17.341s) passed real toolkit cryptographic proofs,local media wire200/200/206,
and actual `getApplicationReady()` completion. Official existing `setTestRelays` returnedok and local31848.
Unchanged3-card15s wait still found0,so readiness correction is **not demonstrated as the cause/fix**.
Failure diagnostics:appPresent true,relayHealth.relays=[ws://127.0.0.1:31848],unreachable=[],backoff={},feedItems=[];
actual styled Trending page empty,version1834b6a9. These are configured health/cache observations,not proof of an
actual WS subscription or delivered EVENT/EOSE. That boundary was not traced in this run.
No login/nav/modal/remaining viewport action ran. No product defect is established. Resources closed15:55:18.667Z;
explicit RELEASE15:55:33Z. Screenshotplayback-qa-2-resumed-stop.png SHA256e065fd4216da5cefbc9bde4b5773a4bd3ac64e9aeb642996d936755482598fab.

Dispatch15:55:53 now routes narrow read-only boundary measurement,not more speculative corrections.
Interpreter15:55:45 identified missing canonical s tag. Cheap **actual source** validation confirms:
- validateEventStructure(videoPost,without s)→validfalse,Missing required tag for videoPost:s.
- Same real signed note plus[s,nostr:dTag]→validtrue.
- Actual convertEventToVideo returnsinvalidfalse for BOTH,so schema gap is real but not proven as feed failure cause.
No seed/runtime/assertion/browser change followed this probe. Both signatures and actual relayfilter match already passed.
The scratch seed differs from canonical existing fixture's s tag;this gap must remain explicit in fidelity claims.

Missing saved boundary evidence:actual localWS creation/REQfilters,relaymatching EVENT/EOSE traffic,then ingest and
render cachecounts. Proposed one diagnostic-only pass uses passive page websocket/frame listeners+warn/errors;
read-only rawEvents/allEvents/activeMap/appvideosMap counts and actualDOMcard selectors at first failure.
Original seed stays unchanged for measurement;no manual data injection,render invocation,health fakery,crypto stub,
new mirrors or timeout/count relaxation. Requires dispatch's explicit diagnostic grant before another browser.

Latest failed-run report:

```json
{
  "driver": "noninteractive bounded actions",
  "started": "2026-10-20T15:55:01.326Z",
  "mirrorHits": [
    "https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm"
  ],
  "blockedHttp": [
    "https://esm.sh/@aws-sdk/client-s3@3.637.0?bundle",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/+esm",
    "https://esm.sh/nostr-tools@2.17.0",
    "https://esm.sh/nostr-tools@2.17.0?target=es2022&exports=nip04",
    "https://esm.sh/nostr-tools@2.17.0/nip44?target=es2022",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js",
    "https://cdn.jsdelivr.net/npm/nostr-tools@2.17.0/lib/nostr.bundle.min.js"
  ],
  "blockedWs": [],
  "failedLocal": [],
  "pageErrors": [],
  "consoleErrors": [
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector"
  ],
  "actions": [
    {
      "name": "actual toolkit ready",
      "at": "2026-10-20T15:55:03.441Z",
      "result": {
        "callable": true,
        "canonicalIdentity": true,
        "frozen": true,
        "mockFlag": false,
        "validSeed": true,
        "tamperedRejected": true,
        "pubkeyMatches": true,
        "independentSignatureVerified": true
      },
      "ok": true
    },
    {
      "name": "actual application startup completes",
      "at": "2026-10-20T15:55:03.484Z",
      "result": {
        "readyPromiseCompleted": true,
        "relays": [
          "ws://127.0.0.1:31848"
        ]
      },
      "ok": true
    },
    {
      "name": "three synthetic relay cards hydrate",
      "at": "2026-10-20T15:55:03.491Z",
      "ok": false,
      "error": "page.evaluate: Error: [testHarness] Timed out waiting for 3 feed items (found 0)\n    at check (http://127.0.0.1:31847/js/testHarness.js:571:11)"
    },
    {
      "screenshot": "playback-qa-2-resumed-stop.png"
    }
  ],
  "fixtureHttp": {
    "head": 200,
    "get": 200,
    "range": 206,
    "bytes": 1019,
    "contentType": "video/webm"
  },
  "browserVersion": "154.0.8037.97",
  "boot": "passed",
  "baseline": "blocked-or-failed",
  "failedStep": "three synthetic relay cards hydrate",
  "failure": "page.evaluate: Error: [testHarness] Timed out waiting for 3 feed items (found 0)\n    at check (http://127.0.0.1:31847/js/testHarness.js:571:11)",
  "failureDiagnostics": {
    "appPresent": true,
    "relayHealth": {
      "relays": [
        "ws://127.0.0.1:31848"
      ],
      "unreachable": [],
      "backoff": {}
    },
    "feedItems": [],
    "body": "Switch to dark theme\nTrending\n\nNo public videos available yet. Be the first to upload one!\n\nseed. zap. subscribe.\nv: 1834b6a9 \u2022 2026-10-20"
  },
  "ended": "2026-10-20T15:55:18.667Z",
  "resourcesClosed": true
}
```

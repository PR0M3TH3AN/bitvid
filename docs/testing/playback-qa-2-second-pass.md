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

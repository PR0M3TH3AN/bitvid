> Latest checkpoint16:08:41: [measured cold-feed render gap](playback-qa-2-render-gap.md) routed to client7.
> Actual app now boots and ingests/admits3 videos,but no cards render. Core/mobile baseline remains blocked;
> the source-checkout failure below is historical and no longer the active prerequisite.

# playback-qa-2: actual-app offline baseline blocked

Baseline HEAD: `ac99ae9a6bdbeae555a30f659b0720ae67e777e8`.
Assignment `filedAt`: `1bb3a4fc452969f060c09a286b72b8cd7ac4123e`.
`git diff 1bb3a4fc..HEAD -- js index.html config scripts/agent/simple-relay.mjs tests/e2e/helpers/bitvidTestFixture.ts`
was empty. Relevant actual app/harness behavior is unchanged; no product/CSS/test/helper/config edits.

## Plan and authority

- Use actual repository index/app modules with existing simple-relay and documented test harness relay overrides.
- One Chromium pass at360×800,390×844,1280×720; stop at the first hard offline boot blocker.
- Block/log non-local HTTP and WebSocket attempts, use only synthetic local notes/test identities if needed.
- Inspect feed/nav/Profile/Upload/required fields/overflow/focus only after successful actual app boot.
- Preserve precise failure evidence; no module substitution, public downloads, build/full suite or product edits.

Browser-only slot granted in dispatch mailbox20261020T150619, consumed before preparation.
START sent to dispatch15:08:13Z **before** browser/server launch; reservation was in `.task`.
Actual execution15:08:16.718Z→15:08:32.952Z (16.234s); no browser/gate contention observed during this pass,
no resource waiting between START and execution, no claim about unrelated host work.

## Actual result

`node /tmp/bitvid-playback-qa-2/baseline.mjs`: process exit0, **scenario blocked**, not a passing app scenario.
Chromium154.0.8037.97, fresh context, first viewport360×800. Existing app is served directly from this worktree
on127.0.0.1:31847; existing simple-relay runs on private31848/31849 using its unchanged API.
Temporary own node_modules symlink reused existing installed dependencies read-only and was removed afterward.
Service workers were disabled to keep interception deterministic; no application methods/toolkit were substituted.

`page.waitForFunction(() => typeof window.__bitvidTest__ === 'object', null, {timeout:15000})`
timed out. This is the documented fixture harness-ready bound, not a retry or relaxed assertion.
Static import chain `js/index.js:4` → `js/bufferPolyfill.js:1` requires:

```js
import { Buffer } from "https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm";
```

The network guard blocked that request. Static dependency loading cannot complete, so the app's early
`installTestHarness()` statement is never reached. Exactly1 blocked non-local HTTP attempt was observed;
0 WebSocket attempts reached the non-local guard,0 pageerror events. This is an offline boot/fixture constraint,
not a demonstrated mobile-layout product defect. Missing assets are a separate environment limitation:
`http://127.0.0.1:31847/css/tailwind.generated.css` returned404; own worktree has no generated CSS/dist,
and building is excluded from this pass. Screenshot shows unstyled static shell/search/logo, not a hydrated app.

[Captured360×800 screenshot](playback-qa-2-boot-blocker.png)

| Viewport / flow | Outcome |
| --- | --- |
|360×800 actual app boot / harness |BLOCKED:15s harness timeout |
|390×844 /1280×720 |Not run after first hard blocker |
| Feed initial hydration/local seeded cards |Unverified; no synthetic events needed/seeded |
| Home/Explore/ForYou navigation |Unverified |
| Profile/Upload open-close / required fields |Unverified |
| Card controls/touch target sizes/overflow/focus |Unverified; unstyled shell cannot qualify layout |

No real signer,peers,buckets,public media,production data or external publishing was used.
No successful non-local page requests were allowed. Actual local page bootstrap was attempted; this is not
module-harness success, full app/mobile qualification, or a Firefox/KNOWN_ISSUES hydration-flake diagnosis.

## Cleanup and routing

Own browser/context and app/relay servers closed in finally at15:08:32.952Z. Browser slot RELEASE explicitly
sent to dispatch15:08:53Z; .task updated. Preview3000 was untouched; no other processes stopped.
Blocker sent with exact trigger and evidence; waiting on dispatch to route an offline asset/harness strategy.
Do not permit public CDN traffic or substitute Buffer/app/modules and silently call this an actual-app pass.
No full/normal queue submission without dispatch's explicit slot for this new item.

## Observed browser errors

```text
Failed to load resource: the server responded with a status of 404 (Not Found)
Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector
```

## Reproduction script

Create `/tmp/bitvid-playback-qa-2`; temporarily link existing installed node_modules into this worktree if absent,
then save/run this script using the granted browser-only slot. It closes its own resources on the first blocker.
Remove that own symlink after the process exits. Requires existing main checkout Playwright/dependencies;
no installing or downloading assets is part of this reproduction.

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from '/home/user/Documents/GitHub/bitvid/node_modules/playwright/index.mjs';
import { startRelay } from '/home/user/Documents/GitHub/bitvid-playback-qa/scripts/agent/simple-relay.mjs';
const root='/home/user/Documents/GitHub/bitvid-playback-qa';
const out='/tmp/bitvid-playback-qa-2';
const {writeFile}=await import('node:fs/promises');
const result={started:new Date().toISOString(),viewports:[],blockedHttp:[],blockedWs:[],failedLocal:[],pageErrors:[],consoleErrors:[]};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:31847');
 let path=decodeURIComponent(url.pathname);if(path==='/')path='/index.html';
 const file=resolve(root,'.'+path);
 if(!file.startsWith(root+'/')||path.includes('/.')||!['.html','.js','.mjs','.json','.css','.svg','.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2','.ttf','.wasm','.map','.webmanifest'].includes(extname(file))){res.writeHead(404);res.end();return;}
 try{const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(file)]||'application/octet-stream');res.end(data);}
 catch{res.writeHead(404);res.end();}
});
let relay,browser;
try{
 await new Promise((ok,no)=>{server.once('error',no);server.listen(31847,'127.0.0.1',ok);});
 relay=startRelay(31848,{httpPort:31849});
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 result.browserVersion=browser.version();
 const context=await browser.newContext({viewport:{width:360,height:800},serviceWorkers:'block'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(['127.0.0.1','localhost','[::1]'].includes(u.hostname))return route.continue();result.blockedHttp.push(route.request().url());return route.abort('blockedbyclient');});
 await context.routeWebSocket('**/*',ws=>{const u=new URL(ws.url());if(['127.0.0.1','localhost','[::1]'].includes(u.hostname))ws.connectToServer();else{result.blockedWs.push(ws.url());ws.close();}});
 await context.addInitScript(()=>{localStorage.setItem('hasSeenDisclaimer','true');localStorage.setItem('__bitvidTestMode__','1');localStorage.setItem('__bitvidTestRelays__',JSON.stringify(['ws://127.0.0.1:31848']));window.__bitvidTestRelays__=['ws://127.0.0.1:31848'];localStorage.setItem('bitvid_admin_whitelist_mode','false');});
 const page=await context.newPage();
 page.on('pageerror',e=>result.pageErrors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text().slice(0,700));});
 page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).hostname==='127.0.0.1')result.failedLocal.push({url:r.url(),status:r.status()});});
 for(const viewport of [{width:360,height:800},{width:390,height:844},{width:1280,height:720}]){
  await page.setViewportSize(viewport);
  await page.goto('http://127.0.0.1:31847/?__test__=1&__testRelays__=ws%3A%2F%2F127.0.0.1%3A31848',{waitUntil:'domcontentloaded'});
  const v={viewport,flows:{}};result.viewports.push(v);
  try{
   await page.waitForFunction(()=>typeof window.__bitvidTest__==='object',null,{timeout:15000});
   await page.waitForFunction(async()=>{const m=await import('/js/applicationContext.js');return !!m.getApplication();},null,{timeout:15000});
   await page.locator('[data-testid="video-list"]').waitFor({state:'visible',timeout:15000});
   v.flows.boot='passed';
  }catch(e){v.flows.boot='blocked';v.blocker=e.message.split('\n')[0];v.dom=await page.locator('body').innerText();await page.screenshot({path:root+'/docs/testing/playback-qa-2-boot-blocker.png',fullPage:true});result.firstHardBlocker=true;break;}
  v.layout=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,focus:document.activeElement?.tagName}));
  // Stop at a new blocker rather than modifying product/fixture behavior.
  v.flows.remaining='actual app booted; further actions require live harness state inspection';
  await page.screenshot({path:out+`/${viewport.width}.png`,fullPage:true});
 }
 await context.close();
} catch(e){result.runError=e.stack;process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(relay)await relay.close();
 await new Promise(ok=>server.close(ok));
 result.ended=new Date().toISOString();result.resourcesClosed=true;
 await writeFile(out+'/result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({started:result.started,ended:result.ended,browserVersion:result.browserVersion,viewports:result.viewports.map(v=>({viewport:v.viewport,flows:v.flows,blocker:v.blocker})),blockedHttp:result.blockedHttp,blockedWs:result.blockedWs,failedLocal:result.failedLocal,pageErrors:result.pageErrors,runError:result.runError,resourcesClosed:result.resourcesClosed}));
}
```

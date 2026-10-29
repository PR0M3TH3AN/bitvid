# QA2 granted final attempt: exact scratch driver

Unretained diagnostic/browser runner, not an added regression test. SHA256 a420415d0b4e0da1713386458e83c26db4db0d089470c441d043e72920f0967d.

```js
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mediaResponse} from './media-fixture.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {chromium} from '/home/user/Documents/GitHub/bitvid/node_modules/playwright/index.mjs';
import {startRelay} from '/home/user/Documents/GitHub/bitvid-playback-qa/scripts/agent/simple-relay.mjs';
const require=createRequire('/home/user/Documents/GitHub/bitvid/package.json');
const {finalizeEvent,verifyEvent}=require('nostr-tools');
import {NOTE_TYPES,validateEventStructure} from '/home/user/Documents/GitHub/bitvid-playback-qa/js/nostrEventSchemas.js';
const base='/tmp/bitvid-playback-qa-2-final',root=base+'/dist';
const evidence='/home/user/Documents/GitHub/bitvid-playback-qa/docs/testing';
const report={driver:'noninteractive bounded actions',started:new Date().toISOString(),mirrorHits:[],blockedHttp:[],blockedWs:[],failedLocal:[],pageErrors:[],consoleErrors:[],actions:[]};
const sk=new Uint8Array(32).fill(0x7b);
const fixtureBytes=await readFile(base+'/fixtures/qa2-unplayed.webm');
if(createHash('sha256').update(fixtureBytes).digest('hex')!=='d911005a5bca7fb1f3e5aa2fbee701b6476c9baf93460264c2aa5105dd0b3c69')throw Error('local genuine fixture hash changed');
const frozenManifest=await readFile(base+'/dist-manifest.json');
if(createHash('sha256').update(frozenManifest).digest('hex')!=='2747d37916362971a5abe05db4018adf31b5c7031b48d8e4bd6eb1e19b9fa927')throw Error('integrated artifact manifest changed');
for(const [name,hash] of Object.entries(JSON.parse(frozenManifest)))if(createHash('sha256').update(await readFile(root+'/'+name)).digest('hex')!==hash)throw Error('integrated artifact byte changed: '+name);
const server=createServer(async(req,res)=>{
 let path=decodeURIComponent(new URL(req.url,'http://127.0.0.1:31847').pathname);if(path==='/qa2-unplayed.webm'){const r=mediaResponse(req.method,req.headers.range,fixtureBytes);res.writeHead(r.status,r.headers);res.end(r.body);return;}if(path==='/')path='/index.html';const f=resolve(root,'.'+path);
 if(!f.startsWith(root+'/')||path.includes('/.')){res.writeHead(404);res.end();return;}
 try{const b=await readFile(f);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(f)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404);res.end();}
});
let browser,relay,context,page,closed=false,hardDeadline;
async function finish(){if(closed)return;closed=true;clearTimeout(hardDeadline);if(context)await context.close();if(browser)await browser.close();if(relay)await relay.close();await new Promise(ok=>server.close(ok));report.ended=new Date().toISOString();report.resourcesClosed=true;await writeFile(base+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify({type:'CLOSED',ended:report.ended,mirrorHits:report.mirrorHits.length,blockedHttp:report.blockedHttp,blockedWs:report.blockedWs,failedLocal:report.failedLocal,pageErrors:report.pageErrors}));}
hardDeadline=setTimeout(()=>{report.deadlineFailure='120s bounded runner deadline';void finish().finally(()=>process.exit(1));},120000);
try{
 await new Promise((ok,no)=>{server.once('error',no);server.listen(31847,'127.0.0.1',ok);});
 relay=startRelay(31848,{httpPort:31849});
 for(let i=0;i<3;i++){const title=i===0?'QA local synthetic video with a deliberately long title to inspect narrow-card wrapping and controls':'QA local synthetic video '+i;const event=finalizeEvent({kind:30078,created_at:Math.floor(Date.now()/1000)-i,tags:[['d','qa2-'+i],['t','video'],['s','nostr:qa2-'+i],['title',title],['url','http://127.0.0.1:31847/qa2-unplayed.webm']],content:JSON.stringify({version:3,title,url:'http://127.0.0.1:31847/qa2-unplayed.webm',videoRootId:'qa2-'+i,mode:'dev',isPrivate:false,deleted:false})},sk);if(!validateEventStructure(NOTE_TYPES.VIDEO_POST,event).valid||!verifyEvent(JSON.parse(JSON.stringify(event))))throw Error('canonical real signed fixture invalid');relay.seedEvent(event);}
 const fixtureUrl='http://127.0.0.1:31847/qa2-unplayed.webm';
 const head=await fetch(fixtureUrl,{method:'HEAD'}),whole=await fetch(fixtureUrl),part=await fetch(fixtureUrl,{headers:{Range:'bytes=0-31'}});
 const wholeBytes=Buffer.from(await whole.arrayBuffer()),partBytes=Buffer.from(await part.arrayBuffer());
 if(head.status!==200||head.headers.get('content-type')!=='video/webm'||Number(head.headers.get('content-length'))!==fixtureBytes.length||whole.status!==200||!wholeBytes.equals(fixtureBytes)||part.status!==206||!partBytes.equals(fixtureBytes.subarray(0,32)))throw Error('genuine local media HTTP preflight failed');
 report.fixtureHttp={head:head.status,get:whole.status,range:part.status,bytes:fixtureBytes.length,contentType:head.headers.get('content-type')};
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
  await step('actual toolkit ready',async()=>{
   const event=[...relay.getEvents().values()].find(e=>e.kind===30078);
   const ready=await page.evaluate(async(seed)=>{
    const m=await import('/js/nostrToolsBootstrap.js'),t=await m.nostrToolsReady;
    const callable=['getPublicKey','finalizeEvent','verifyEvent'].every(k=>typeof t?.[k]==='function');
    const state={callable,canonicalIdentity:t===window.__BITVID_CANONICAL_NOSTR_TOOLS__,frozen:Object.isFrozen(t),mockFlag:!!window.__TEST_MODE__||window.process?.env?.NODE_ENV==='test'};
    if(!callable)return state;
    const sk=new Uint8Array(32).fill(0x7b),clean=JSON.parse(JSON.stringify(seed));
    state.validSeed=t.verifyEvent(clean)===true;state.tamperedRejected=t.verifyEvent({...JSON.parse(JSON.stringify(seed)),content:'tampered local challenge'})===false;state.pubkeyMatches=t.getPublicKey(sk)===seed.pubkey;
    state.signed=t.finalizeEvent({kind:1,created_at:seed.created_at,tags:[],content:'QA real toolkit sanity'},sk);
    return state;
   },event);
   const {signed,...status}=ready;
   check(status.callable&&status.canonicalIdentity&&status.frozen&&!status.mockFlag&&status.validSeed&&status.tamperedRejected&&status.pubkeyMatches,'real toolkit contract unavailable: '+JSON.stringify(status));
   const {verifyEvent}=require('nostr-tools');check(verifyEvent(JSON.parse(JSON.stringify(signed)))===true,'actual toolkit signature failed independent Node verification');
   return {...status,independentSignatureVerified:true};
  });
  await step('actual application startup completes',async()=>{
   await page.waitForFunction(async()=>{const m=await import('/js/applicationContext.js');await m.getApplicationReady();return !!m.getApplication();},null,{timeout:15000});
   const relayState=await page.evaluate(()=>window.__bitvidTest__.setTestRelays(['ws://127.0.0.1:31848'],{persist:false}));
   check(relayState.ok===true,'documented fixture relay alignment failed');
   return {readyPromiseCompleted:true,relays:relayState.relays};
  });
  await step('three synthetic relay cards hydrate',async()=>{await page.evaluate(()=>window.__bitvidTest__.waitForFeedItems(3,15000));const items=await page.evaluate(()=>window.__bitvidTest__.getFeedItems());check(items.length===3,'expected exactly3 local cards,got'+items.length);return items.map(x=>({title:x.title,dTag:x.dTag}));});
  await step('local test identity login',async()=>{await page.evaluate(()=>window.__bitvidTest__.loginWithNsec('7b'.repeat(32)));await page.locator('[data-testid="profile-button"]').waitFor({state:'visible'});await page.locator('[data-testid="upload-button"]').waitFor({state:'visible'});return {profileVisible:true,uploadVisible:true};});
  for(const viewport of [{width:360,height:800},{width:390,height:844},{width:1280,height:720}]){
   await page.setViewportSize(viewport);const prefix=String(viewport.width);
   await step(prefix+' trending navigation/feed',async()=>{await page.locator('#trendingLink').click();await page.waitForFunction(()=>location.hash.includes('view=trending'));await page.evaluate(()=>window.__bitvidTest__.waitForFeedItems(3,15000));const r=await layout();check(r.documentWidth<=r.width,'horizontal document overflow');check(r.cardBounds.every(x=>x.x>=0&&x.right<=r.width),'card extends beyond viewport');return r;});
   await capture('playback-qa-2-'+prefix+'-feed.png');
   for(const [id,view] of [['#exploreLink','explore'],['#forYouLink','for-you'],['#trendingLink','trending']])await step(prefix+' navigation '+view,async()=>{await page.locator(id).click();await page.waitForFunction(v=>location.hash.includes('view='+v),view);return {hash:await page.evaluate(()=>location.hash),headings:await page.locator('h1,h2').allTextContents()};});
   await step(prefix+' Profile open/focus/close',async()=>{await page.locator('[data-testid="profile-button"]').click();await page.locator('#profileModal').waitFor({state:'visible'});const focus=await modalFocus('#profileModal');await capture('playback-qa-2-'+prefix+'-profile.png');await page.locator('#closeProfileModal').click();await page.locator('#profileModal').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.id==='profileButton');const restored=await page.evaluate(()=>document.activeElement?.id);check(restored==='profileButton','Profile close did not restore trigger focus');return {focus,restored};});
   await step(prefix+' Upload required fields/focus/close',async()=>{const videoCount=()=>[...relay.getEvents().values()].filter(e=>e.kind===30078).length;const before=videoCount();await page.locator('[data-testid="upload-button"]').click();await page.locator('#uploadModal').waitFor({state:'visible'});await page.locator('#btn-mode-external').click();const focus=await modalFocus('#uploadModal');await page.locator('#input-title').fill('');await page.locator('#input-url').fill('');await page.locator('#input-magnet').fill('');await page.locator('#btn-submit').click();const missingTitle=await page.locator('#input-title').evaluate(e=>e.validity.valueMissing);check(missingTitle,'empty title not rejected by native validation');await page.locator('#input-title').fill('QA invalid local form');await page.locator('#btn-submit').click();await page.waitForFunction(()=>document.querySelector('#errorContainer')?.textContent.includes('Please provide at least a Video URL or Magnet Link.'));check(videoCount()===before,'invalid form published video event');await capture('playback-qa-2-'+prefix+'-upload-validation.png');const l=await layout();check(l.documentWidth<=l.width,'Upload horizontal document overflow');await page.locator('#closeUploadModal').click();await page.locator('#uploadModal').waitFor({state:'hidden'});const restored=await page.evaluate(()=>document.activeElement?.id);check(restored==='uploadButton','Upload close did not restore trigger focus');return {focus,missingTitle,noSourceRejected:true,noRelayPublish:true,restored,layout:l};});
   await step(prefix+' Home navigation',async()=>{await page.getByRole('link',{name:'Return to the bitvid home page',exact:true}).click();await page.waitForURL('**/index.html');await page.waitForFunction(()=>!!window.__bitvidTest__);await page.waitForFunction(async()=>{const m=await import('/js/applicationContext.js');await m.getApplicationReady();return !!m.getApplication();},null,{timeout:15000});await page.evaluate(()=>window.__bitvidTest__.waitForFeedItems(3,15000));const items=await page.evaluate(()=>window.__bitvidTest__.getFeedItems());check(items.length===3,'Home expected exactly3 local cards');return {url:page.url(),cards:items.length};});
  }
  report.baseline='completed';
 }catch(e){report.baseline='blocked-or-failed';report.failedStep=report.actions.findLast(x=>x.ok===false)?.name;report.failure=e.message;try{report.failureDiagnostics=await page.evaluate(async()=>{const m=await import('/js/applicationContext.js');return {appPresent:!!m.getApplication(),relayHealth:window.__bitvidTest__?.getRelayHealth(),feedItems:window.__bitvidTest__?.getFeedItems(),body:document.body.innerText.slice(0,2000)};});}catch{}await capture('playback-qa-2-resumed-stop.png');}
 await finish();
}catch(e){report.runError=e.stack;console.log(JSON.stringify({type:'ERROR',error:e.stack}));await finish();process.exitCode=1;}

```

# QA3 scratch diagnostic drivers

Exact first driver; no retained test added.

```js
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const vm=require('node:vm');
const dep='/home/user/Documents/GitHub/bitvid-dispatch/node_modules/';
const {firefox}=require(dep+'playwright');
const {expect}=require(dep+'@playwright/test');
const {transformHook}=require(dep+'playwright/lib/transform/transform.js');
const root='/home/user/Documents/GitHub/bitvid-playback-qa';
const report={started:new Date().toISOString(),sha:'c5b678f7c9d0b92fbf786b16ae831f1be1d0b899',cases:[],blocked:[],pageErrors:[]};
let browser,server;
(async()=>{
 const source=await fs.readFile(root+'/tests/e2e/runtime-coverage-expansion.spec.ts','utf8');
 const tests=[];const test=(name,fn)=>tests.push({name,fn});test.describe=(_,fn)=>fn();
 const code=transformHook(source.replace('import { expect, test } from "./helpers/instrumentedTest";',''),'/tmp/playback-qa-3-original.ts').code;
 vm.runInNewContext(code,{test,expect,exports:{},require});
 server=http.createServer(async(req,res)=>{let p=new URL(req.url,'http://localhost').pathname;if(p==='/')p='/index.html';const file=path.resolve(root,'.'+p);if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}try{const bytes=await fs.readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>server.listen(31857,'127.0.0.1',ok));
 browser=await firefox.launch({headless:true});report.browser=browser.version();
 for(const t of tests.slice(0,3)){
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin==='http://127.0.0.1:31857')return r.continue();report.blocked.push(u.origin+u.pathname);return r.abort('blockedbyclient');});
  await context.routeWebSocket('**/*',r=>{report.blocked.push(r.url());r.close();});
  const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
  const proxy={goto:(url,opts)=>page.goto('http://127.0.0.1:31857'+url,opts),evaluate:async(...args)=>{const result=await page.evaluate(...args);report.cases.at(-1).result=result;return result;}};
  const item={name:t.name};report.cases.push(item);
  try{await t.fn({page:proxy});item.pass=true;}catch(e){item.pass=false;item.error=e.message;}
  await context.close();
 }
})().catch(e=>{report.blocker=e.stack;process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(ok=>server.close(ok));report.ended=new Date().toISOString();report.resourcesClosed=true;await fs.writeFile('/tmp/playback-qa-3-local.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});

```

App-ready plus isolated-control driver; readiness deliberately differs from CI networkidle-only setup.

```js
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const vm=require('node:vm');
const dep='/home/user/Documents/GitHub/bitvid-dispatch/node_modules/';
const {firefox}=require(dep+'playwright');
const {expect}=require(dep+'@playwright/test');
const {transformHook}=require(dep+'playwright/lib/transform/transform.js');
const root='/home/user/Documents/GitHub/bitvid-playback-qa';
const report={mirrorHits:0,started:new Date().toISOString(),sha:'c5b678f7c9d0b92fbf786b16ae831f1be1d0b899',cases:[],blocked:[],pageErrors:[]};
let browser,server;
(async()=>{
 const source=await fs.readFile(root+'/tests/e2e/runtime-coverage-expansion.spec.ts','utf8');
 const tests=[];const test=(name,fn)=>tests.push({name,fn});test.describe=(_,fn)=>fn();
 const code=transformHook(source.replace('import { expect, test } from "./helpers/instrumentedTest";',''),'/tmp/playback-qa-3-original.ts').code;
 vm.runInNewContext(code,{test,expect,exports:{},require});
 server=http.createServer(async(req,res)=>{let p=new URL(req.url,'http://localhost').pathname;if(p==='/')p='/index.html';const file=path.resolve(root,'.'+p);if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}try{const bytes=await fs.readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>server.listen(31857,'127.0.0.1',ok));
 browser=await firefox.launch({headless:true});report.browser=browser.version();
 const mirror=await fs.readFile('/tmp/playback-qa-3-assets/buffer.mjs');
 for(const mode of ['app-ready','isolated']) for(const t of tests.slice(0,3)){
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.href==='https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm'){report.mirrorHits++;return r.fulfill({body:mirror,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}});}if(mode==='isolated' && u.origin==='http://127.0.0.1:31857' && u.pathname==='/')return r.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'});if(u.origin==='http://127.0.0.1:31857')return r.continue();report.blocked.push(u.origin+u.pathname);return r.abort('blockedbyclient');});
  await context.routeWebSocket('**/*',r=>{report.blocked.push(r.url());r.close();});
  const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
  const proxy={goto:async(url,opts)=>{await page.goto('http://127.0.0.1:31857'+url,opts);if(mode==='app-ready'){await page.waitForFunction(async()=>{const m=await import('/js/applicationContext.js');await m.getApplicationReady();return !!m.getApplication() && !!window.__bitvidTest__ && !!document.getElementById('videoList');},null,{timeout:15000});item.ready=await page.evaluate(()=>({harness:!!window.__bitvidTest__,videoLists:document.querySelectorAll('#videoList').length,heading:document.querySelector('h1,h2')?.textContent}));}return;},evaluate:async(...args)=>{const result=await page.evaluate(...args);report.cases.at(-1).result=result;return result;}};
  const item={mode,name:t.name};report.cases.push(item);
  try{await t.fn({page:proxy});item.pass=true;}catch(e){item.pass=false;item.error=e.message;if(!item.ready && mode==='app-ready')throw new Error('actual-app readiness blocked: '+e.message);}
  await context.close();
 }
})().catch(e=>{report.blocker=e.stack;process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(ok=>server.close(ok));report.ended=new Date().toISOString();report.resourcesClosed=true;await fs.writeFile('/tmp/playback-qa-3-app-ready-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});

```

Original-timing passive DOM trace driver; exact original callbacks/expectations, no readiness wait.

```js
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const vm=require('node:vm');
const dep='/home/user/Documents/GitHub/bitvid-dispatch/node_modules/';
const {firefox}=require(dep+'playwright');
const {expect}=require(dep+'@playwright/test');
const {transformHook}=require(dep+'playwright/lib/transform/transform.js');
const root='/home/user/Documents/GitHub/bitvid-playback-qa';
const report={mirrorHits:0,started:new Date().toISOString(),sha:'c5b678f7c9d0b92fbf786b16ae831f1be1d0b899',cases:[],blocked:[],pageErrors:[]};
let browser,server;
(async()=>{
 const source=await fs.readFile(root+'/tests/e2e/runtime-coverage-expansion.spec.ts','utf8');
 const tests=[];const test=(name,fn)=>tests.push({name,fn});test.describe=(_,fn)=>fn();
 const code=transformHook(source.replace('import { expect, test } from "./helpers/instrumentedTest";',''),'/tmp/playback-qa-3-original.ts').code;
 vm.runInNewContext(code,{test,expect,exports:{},require});
 server=http.createServer(async(req,res)=>{let p=new URL(req.url,'http://localhost').pathname;if(p==='/')p='/index.html';const file=path.resolve(root,'.'+p);if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}try{const bytes=await fs.readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
 await new Promise(ok=>server.listen(31857,'127.0.0.1',ok));
 browser=await firefox.launch({headless:true});report.browser=browser.version();
 const mirror=await fs.readFile('/tmp/playback-qa-3-assets/buffer.mjs');
 for(const t of tests.slice(0,3)){
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.href==='https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm'){report.mirrorHits++;return r.fulfill({body:mirror,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}});}if(u.origin==='http://127.0.0.1:31857')return r.continue();report.blocked.push(u.origin+u.pathname);return r.abort('blockedbyclient');});
  await context.routeWebSocket('**/*',r=>{report.blocked.push(r.url());r.close();});
  await context.addInitScript(()=>{
   const ids=new WeakMap();let next=0;const id=n=>n?(ids.has(n)?ids.get(n):(ids.set(n,++next),next)):null;
   const trace=[];window.__qaTrace=trace;
   const get=Document.prototype.getElementById;
   const snap=(type,node)=>{if(trace.length>=300)return;trace.push({type,at:performance.now(),node:id(node),connected:node?.isConnected,videoList:id(get.call(document,'videoList')),body:id(document.body),harness:!!window.__bitvidTest__,stack:new Error().stack?.split('\n').slice(1,5)});};
   Document.prototype.getElementById=function(name){const r=get.call(this,name);if(name==='videoList')snap('getElementById-videoList',r);return r;};
   const desc=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
   Object.defineProperty(Element.prototype,'innerHTML',{...desc,set(value){const watch=this===document.body||this.id==='videoList';if(watch)snap('before-innerHTML',this);desc.set.call(this,value);if(watch)snap('after-innerHTML',this);}});
   new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.id==='videoList'||n.querySelector?.('#videoList')))))snap('mutation-videoList',get.call(document,'videoList'));}).observe(document,{childList:true,subtree:true});
  });
  const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
  const proxy={goto:(url,opts)=>page.goto('http://127.0.0.1:31857'+url,opts),evaluate:async(...args)=>{const result=await page.evaluate(...args);report.cases.at(-1).result=result;report.cases.at(-1).trace=await page.evaluate(()=>window.__qaTrace);report.cases.at(-1).postResultState=await page.evaluate(async()=>{const m=await import('/js/applicationContext.js');return {application:!!m.getApplication(),harness:!!window.__bitvidTest__,videoLists:document.querySelectorAll('#videoList').length};});return result;}};
  const item={name:t.name};report.cases.push(item);
  try{await t.fn({page:proxy});item.pass=true;}catch(e){item.pass=false;item.error=e.message;}
  await context.close();
 }
})().catch(e=>{report.blocker=e.stack;process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(ok=>server.close(ok));report.ended=new Date().toISOString();report.resourcesClosed=true;await fs.writeFile('/tmp/playback-qa-3-causal-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});

```

Exact Playwright runner scratch overlay and network-only auto fixture. Spec is original source with only registration import changed to ../guard.

playwright.config.ts

```js
import original from '/home/user/Documents/GitHub/bitvid-playback-qa/playwright.config';
export default {...original,testDir:'/tmp/playback-qa-3-runner',globalSetup:'/home/user/Documents/GitHub/bitvid-playback-qa/tests/e2e/helpers/playwrightCoverageGlobalSetup.ts',outputDir:'/tmp/playback-qa-3-runner/results',reporter:[['list'],['json',{outputFile:'/tmp/playback-qa-3-runner/report.json'}]],use:{...original.use,baseURL:'http://127.0.0.1:31857',serviceWorkers:'block'},projects:original.projects.filter(p=>p.name==='e2e-firefox'),webServer:{...original.webServer,command:'node /tmp/playback-qa-3-runner/server.cjs',url:'http://127.0.0.1:31857/docs/kitchen-sink.html',reuseExistingServer:false}};

```

guard.ts

```js
import {test as base,expect} from '/home/user/Documents/GitHub/bitvid-playback-qa/tests/e2e/helpers/instrumentedTest';
import fs from 'node:fs/promises';
const mirror=fs.readFile('/tmp/playback-qa-3-assets/buffer.mjs');
export const test=base.extend({_offlineGuard:[async({context},use,testInfo)=>{
 const blocked:string[]=[];let mirrorHits=0;
 await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.href==='https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm'){mirrorHits++;return r.fulfill({body:await mirror,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}});}if(u.origin==='http://127.0.0.1:31857')return r.continue();blocked.push(u.origin+u.pathname);return r.abort('blockedbyclient');});
 await context.routeWebSocket('**/*',r=>{blocked.push(r.url());r.close();});
 try{await use();}finally{await testInfo.attach('offline-boundary',{body:JSON.stringify({mirrorHits,blocked}),contentType:'application/json'});}
},{auto:true}]});
export {expect};

```

server.cjs

```js
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path');const root='/home/user/Documents/GitHub/bitvid-playback-qa';let server;
 server=http.createServer(async(req,res)=>{let p=new URL(req.url,'http://localhost').pathname;if(p==='/')p='/index.html';const file=path.resolve(root,'.'+p);if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}try{const bytes=await fs.readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
 server.listen(31857,'127.0.0.1');

```

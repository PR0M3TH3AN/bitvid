# playback-qa-1: bounded local fallback qualification

Start UTC: 2026-10-20T13:38:36Z. Baseline: `bbc1be79e941add929c9c51f984778676822b5f2`.
`git diff 0c1dd7e..HEAD -- js/app/playbackCoordinator.js js/services/playbackService.js`
was empty; the filed scenario still applies. Product code and existing tests remain read-only.

Plan:
- Exercise actual coordinator → strategy → playback session, with real magnet derivation/validation.
- Control probe/media/torrent IO only; check source, handoff payload, surfaced error and settlement.
- Retain a focused regression only after dispatch approves the proposed approach.
- Require disabled-fallback mutants to fail, restore scratch product copies, run coordinated normal gates and verify landing ancestry.

## Scratch results

`env -u NODE_TEST_CONTEXT node /tmp/bitvid-playback-qa-1/check.mjs`: exit0,3/3 scenarios
(404 probe → torrent once; media error → torrent once; both fail → null result/error once).
Initial scratch setup failed with absent worktree jsdom, then missing app callback; corrected the fixture
before recording the3/3 result. No product change was made to obtain a pass.

Worktree has no node_modules. Scratch used already-installed main checkout jsdom/playwright read-only;
no dependency install or public sample download. Native test input was generated locally:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=blue:s=64x64:r=10 -t 2 -an -c:v libvpx -y /tmp/bitvid-playback-qa-1/clip.webm
node /tmp/bitvid-playback-qa-1/browser.mjs
```

Browser script: exit0; Chromium154.0.8037.97 and Firefox146.0.1,3/3 each.
Both selected torrent once after a real local HEAD404; substituted torrent handler attached the generated
WebM and awaited native play. Both selected a viable hosted mirror once after HEAD404, with no torrent call.
Both settled null/error once when the alternate rejected; app session/result promise cleared.
Native decoding measured64×64, readyState4, currentTime>0:

| Browser | Substituted torrent transport time | Hosted mirror time |
| --- | ---: | ---: |
| Chromium |0.001026s |0.002208s |
| Firefox |0.000372s |0.160829s |

Zero external requests in either browser. HTTP server bound only127.0.0.1:31847;
all browser requests were origin-filtered; no real torrent client instantiated.
Browser and server closed in finally blocks, released13:40:46Z. Preview3000 untouched.

Fidelity: real imported product orchestration/magnet code, native video element, real local HTTP404/200,
native VP8 decoding. Substituted app/modal callbacks and torrent transport; module harness does not boot
full Application/UI/feed/relay fixture. Local HTTP is a loopback test exception, not HTTPS/CORS qualification.
No actual WebTorrent, swarm, peer, torrent metadata/file selection or webseed consumption was measured.
Hash/webseed preservation is at the torrent-handler boundary, not proof of subsequent network use.
No claim for late stalls after successful startup, HLS, whole Stage3, CPU/RSS, full E2E, signer/wallet or production.

## Coordination and contention

First mailbox read was empty. Claim and inspection started; retention proposal/coordination sent13:39:50Z.
Dispatch's13:38:29 mail was read only after the browser run; it required expensive-browser slot coordination
while an admin drain and client gate were active. The bounded module browser run had already finished.
No resource-contention error was observed in these six scenarios; overlapping gate impact was not measured. This scheduling miss was disclosed to dispatch13:40:48Z; no further browser/full gates will run without clearance.
Sandbox loopback listen failedEPERM; approved elevated rerun completed in8.31s. No automatic review rejection. Lint also required an approved elevated rerun after git-spawnEPERM.
Retention approval/full-gate scheduling wait began13:39:50Z; useful independent evidence work continued.

## Reproduce bounded browser check

Generate the clip above. Save the following as `/tmp/bitvid-playback-qa-1/browser.mjs`.
It uses installed dependencies read-only at the stated main path; adjust only dependency/root paths for another checkout.

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, firefox } from '/home/user/Documents/GitHub/bitvid/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const root='/home/user/Documents/GitHub/bitvid-playback-qa';
const requests=[];
const server=createServer(async(req,res)=>{
 requests.push(req.url);
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<video muted></video>');return;}
 if(req.url==='/dead.webm'){res.writeHead(404);res.end();return;}
 try {
  const path=req.url==='/clip.webm'?'/tmp/bitvid-playback-qa-1/clip.webm':root+req.url;
  if(!/^\/(js|config)\/[a-zA-Z0-9/_.-]+$/.test(req.url)&&req.url!='/clip.webm')throw Error('blocked');
  const data=await readFile(path);
  res.setHeader('Content-Type',req.url.endsWith('.webm')?'video/webm':'text/javascript');res.end(data);
 }catch{res.writeHead(404);res.end();}
});
try {
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(31847,'127.0.0.1',resolve);});
 for(const [name,type] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await type.launch({headless:true,...(name==='chromium'?{executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}: {})});
  try{
   const page=await browser.newPage();const external=[];
   await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:31847'?r.continue():(external.push(r.request().url()),r.abort()));
   await page.goto('http://127.0.0.1:31847');
   const results=await page.evaluate(async()=>{
    const {PlaybackService}=await import('/js/services/playbackService.js');
    const {PlaybackStrategyService}=await import('/js/services/playbackStrategyService.js');
    const {createPlaybackCoordinator}=await import('/js/app/playbackCoordinator.js');
    const {deriveTorrentPlaybackConfig}=await import('/js/playbackUtils.js');
    const {isValidMagnetUri}=await import('/js/utils/magnetValidators.js');
    localStorage.setItem('unmutedAutoplay','false');
    const results=[];
    for(const mode of ['torrent-local-decode','mirror-local-decode','both-fail']){
     const video=document.querySelector('video');video.pause();video.removeAttribute('src');video.load();
     const calls=[],errors=[];const hash='ABCDEF0123456789abcdef0123456789ABCDEF01';
     const url=location.origin+'/dead.webm';const mirror=location.origin+'/clip.webm';
     const magnet=`magnet:?xt=urn:btih:${hash}`;
     const service=new PlaybackService({deriveTorrentPlaybackConfig,isValidMagnetUri});
     const strategy=new PlaybackStrategyService({playbackService:service,logger:{log(){}}});
     const app={modalVideo:video,currentVideo:{},playbackStrategyService:strategy,videoModal:{updateStatus(){}},
      waitForCleanup:async()=>{},cancelPendingViewLogging(){},clearActiveIntervals(){},showModalWithPoster(){},
      teardownVideoElement:v=>v,applyModalLoadingPoster(){},resetTorrentStats(){},preparePlaybackLogging(){},autoplayModalVideo(){},forceRemoveModalPoster(){},showError:x=>errors.push(x),
      probeUrl:async u=>{calls.push(['probe',u]);const r=await fetch(u,{method:'HEAD'});return {outcome:r.ok?'ok':'bad',status:r.status};},
      playViaWebTorrent:async(m,o)=>{calls.push(['torrent',m,o]);if(mode==='both-fail')throw Error('local alternate unavailable');video.src=mirror;await video.play();return {substitutedTransport:true};}
     };
     const result=await createPlaybackCoordinator({}).playVideoWithFallback.call(app,{url,magnet,...(mode==='mirror-local-decode'?{sources:[mirror,mirror]}:{})});
     if(result.source){await new Promise((resolve,reject)=>{if(video.currentTime>0)return resolve();video.addEventListener('timeupdate',resolve,{once:true});video.addEventListener('error',reject,{once:true});});}
     results.push({mode,source:result.source,errors,calls,currentTime:video.currentTime,width:video.videoWidth,height:video.videoHeight,readyState:video.readyState,activeSession:app.activePlaybackSession,activePromise:app.activePlaybackResultPromise});
    }
    return results;
   });
   for(const r of results){
    assert.equal(r.source,r.mode==='both-fail'?null:r.mode==='mirror-local-decode'?'url':'torrent');
    assert.equal(r.calls.filter(c=>c[0]==='torrent').length,r.mode==='mirror-local-decode'?0:1);
    assert.equal(r.errors.length,r.mode==='both-fail'?1:0);
    assert.equal(r.activeSession,null);assert.equal(r.activePromise,null);
    if(r.source){assert.equal(r.width,64);assert.equal(r.height,64);assert.ok(r.currentTime>0);}
   }
   assert.deepEqual(external,[]);console.log(JSON.stringify({browser:name,version:browser.version(),results,externalRequests:external.length}));
  }finally{await browser.close();}
 }
 console.log(JSON.stringify({httpRequests:requests}));
}finally{await new Promise(resolve=>server.close(resolve));}
```

## Retained regression and verification

Dispatch approved the exact retained4-scenario approach13:41:49Z; read before13:42:54Z.
`env -u NODE_TEST_CONTEXT node tests/fleet-playback-fallback.test.mjs`: exit0,4 tests/pass4/fail0/cancelled0/skipped0.
`python3 /tmp/bitvid-playback-qa-1/mutants.py`: exit0; six mutants each rejected exit1.
Restored scratch test run:4/4, exit0. No product changes in worktree.
`npm run lint`: initial sandbox attempt exited2 at lint:hex (git spawnEPERM); approved elevated rerun exited0,11/11 scripts.
Own temporary `node_modules` symlink reused existing main dependencies for lint; no install.
No full unit/E2E/build started independently; normal queue gate awaits dispatch slot.

Isolated mutation reproduction (copy product/test into the scratch tree first):

```sh
mkdir -p /tmp/bitvid-playback-qa-1/tree/tests/test-helpers
cp -R js config /tmp/bitvid-playback-qa-1/tree/
cp package.json /tmp/bitvid-playback-qa-1/tree/
cp tests/test-helpers/setup-localstorage.mjs /tmp/bitvid-playback-qa-1/tree/tests/test-helpers/
cp tests/fleet-playback-fallback.test.mjs /tmp/bitvid-playback-qa-1/tree/tests/
python3 /tmp/bitvid-playback-qa-1/mutants.py
env -u NODE_TEST_CONTEXT node /tmp/bitvid-playback-qa-1/tree/tests/fleet-playback-fallback.test.mjs
```

Save this as the stated mutants.py:

```python
from pathlib import Path
import subprocess, os, json
root=Path('/tmp/bitvid-playback-qa-1/tree')
mutants=[
 ('drop-session-cleanup','js/services/playbackStrategyService.js','this.activePlaybackSession = null;\n        if (typeof context.setActivePlaybackSession', '/* deliberately retain session */\n        if (typeof context.setActivePlaybackSession'),
 ('disable-torrent-fallback','js/services/playbackService.js','if (torrentAttempted) return null;','return null; // deliberately disable alternate\n        if (torrentAttempted) return null;'),
 ('drop-mirror-forwarding','js/services/playbackStrategyService.js','sources: Array.isArray(options.sources) ? options.sources : [],','sources: [],'),
 ('corrupt-literal-hash','js/services/playbackService.js','playViaWebTorrent(this.magnetForPlayback, {','playViaWebTorrent(this.magnetForPlayback.toLowerCase(), {'),
 ('drop-hosted-hint','js/services/playbackService.js','hostedUrlWebSeed: httpsUrl,','hostedUrlWebSeed: "",'),
 ('drop-terminal-error','js/services/playbackStrategyService.js','context.showError(displayMessage);','/* deliberately suppress terminal UI error */'),
]
results=[]
for name,path,old,new in mutants:
 p=root/path; original=p.read_text(); assert original.count(old)==1
 try:
  p.write_text(original.replace(old,new));
  r=subprocess.run(['env','-u','NODE_TEST_CONTEXT','node',str(root/'tests/fleet-playback-fallback.test.mjs')],capture_output=True,text=True,timeout=10)
  Path('/tmp/bitvid-playback-qa-1/'+name+'.log').write_text(r.stdout+r.stderr)
  assert r.returncode!=0, name+' survived'
  results.append({'mutant':name,'exit':r.returncode,'failed':[l for l in r.stdout.splitlines() if l.startswith('not ok')]})
 finally:p.write_text(original)
print(json.dumps(results,indent=2))
```

Pre-gate checkpoint: regression commit `025771a84d95c05842193631c1ace70539558368`.
Merged local unstable into own branch at `acb2fdef3baf74c2526babf79eea8a2451a3aa46`;
sandbox ORIG_HEAD lock initially read-only, then approved elevated local merge succeeded.
Post-merge focused check:4/4, exit0; `git diff --check`: exit0. New RULE-CHANGES read.
Full+submit scheduling explicitly waits behind client then storage per dispatch13:43:52Z.

## Granted merged integration check

Authoritative dispatch mailbox grant header:2026-10-20T14:49:35Z; consumed14:49:46Z.
Its initial body said14:11; dispatch corrected this explicitly in14:49:55 mail, consumed14:50:25Z.
Request13:43:52→grant14:49:35=65m43s resource/coordination wait; grant consumption11s.
Storage release14:09:38→grant14:49:35=39m57s dispatch foreground/wakeup latency, not worker/test time.
The earlier worker reply interpreted14:11 as intended grant time; this was incorrect. It was a stale body timestamp only, with no14:11 send or delivery delay. Dispatch wake/checkpoint lag39m57s is the valid delay metric; grant consumption was11s.

Merged verified unstable7f99c045 into own branch at `124be14310a314bd4ca99d075a7aacc207c238ac`.
`env -u NODE_TEST_CONTEXT node tests/fleet-playback-fallback.test.mjs`: exit0,4/4.
`env -u NODE_TEST_CONTEXT npm run lint`: exit0,11/11 on merged tree (approved outside sandbox for git spawn).
`git diff --check`: exit0.
`env -u NODE_TEST_CONTEXT UNIT_TEST_TIMEOUT_MS=60000 npm test`: exit0, all429 unit files passed, including the new regression; completed14:55:44Z. Actual process exit was checked, not a log-reading command. No timeout/failure or assertion changes.
No browser/build repeat: relevant playback/magnet chain unchanged by predecessor landings.

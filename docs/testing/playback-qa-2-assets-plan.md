# playback-qa-2: genuine cached asset plan, not a browser pass

Read-only preparation authorized by dispatch mailbox20261020T151044; no browser/build/download performed.
Inspection HEAD: `8d7e60ebf1761cda479d18a011dc382af5704f7b` (QA2 blocker evidence commit).
Actual app/mobile outcome remains blocked; no further viewport or core-flow validation claimed.

## Found exact source packages, no install needed

`npm cache ls buffer`, `npm cache ls base64-js`, `npm cache ls ieee754` found exact tarballs in
`/home/user/.npm/_cacache`. Offline `cacache.get` using existing `/usr/share/nodejs/cacache`
read/verified cached content. Recomputed SHA512 matched each cache integrity string AND the corresponding
version's `dist.integrity` in the cached registry packument. No registry/CDN request was made.
This establishes consistency with local cached registry metadata, not new online verification.
Tar package.json confirms names/versions/main/dependencies; genuine source index.js hashes are below.

| Package | Tarball bytes | Tarball SHA256 | index.js SHA256 |
| --- | ---: | --- | --- |
|buffer@6.0.3 |23108 |`555b6f49224afcf6b2c5a9aea7cd34a7f443f395b10532bc5580022d57aa51f5` |`c25853fd31addfce188b01061fe85bfe667d5fb6c7a7bbb1c83d0ddfd8627acc` |
|base64-js@1.5.1 |4109 |`b1b7a945b52685269083425216d6597e33d97bf21699d656e92fdb3eb5210a85` |`829eadd8a1a441d25be0cb93b00e16a0d0c20fd294db95d8f2ed87e6954b7182` |
|ieee754@1.2.1 |2886 |`8ef14b9b397e339db89db97881fb714f49319d8f0eb1275901f45567b28f9dac` |`fe3e2b20c1ebb57c3b390c8f685ad1e04e6f493517fa7e432f4351bb77a1a4d0` |

Buffer6.0.3 declares base64-js^1.3.1 and ieee754^1.2.1; cached1.5.1/1.2.1 satisfy these ranges.
Neither dependency declares further runtime dependencies. Package license files must accompany scratch extraction.
No installed top-level Buffer package is required; tarballs provide genuine source without `npm install`.
No exact cached jsDelivr `+esm` response was found in the npm-cache inventory; npm source is CommonJS.

## Proposed zero-network scratch adapter, approval still required

1. Re-read exact cached tarballs via the cache inspection script below; verify all hashes/integrities before extraction.
2. Extract only safe regular files under their package prefixes into a private scratch node_modules tree
   (`buffer`, `base64-js`, `ieee754`), rejecting absolute/traversal/symlink/hardlink members.
3. Create scratch entry `export { Buffer } from './node_modules/buffer/index.js';`.
4. Use existing esbuild0.27.3 only to bundle that real entry/source/dependency graph as browser ESM.
   Example command, **not run during preparation**:

```sh
/home/user/Documents/GitHub/bitvid/node_modules/.bin/esbuild /tmp/bitvid-playback-qa-2-assets/entry.mjs --bundle --platform=browser --format=esm --outfile=/tmp/bitvid-playback-qa-2-assets/buffer-6.0.3.mjs
```

5. Record output SHA256 and esbuild metafile; require exactly the pinned three genuine package inputs.
   Validate Buffer.from/toString/base64/float/read-write round trips against real Node Buffer before browser use.
   These are adapter sanity checks, not replacements for actual app behavior.
6. With a new explicit browser grant, map **only** original import URL
   `https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm` to those local reconstructed ESM bytes using request fulfillment.
   Every other non-local HTTP/WebSocket request stays blocked/logged; never call route.continue for the mapped CDN.
   Product files/import graph/global setup remain unchanged. No fake Buffer/toolkit or no-op module.
7. If another hard offline dependency appears, stop/report/release again. No speculative substitution or public fetching.

Fidelity: exact npm Buffer6.0.3 implementation and pinned genuine dependencies, repackaged by local esbuild;
**not byte-identical to jsDelivr's generated ESM, nor CDN availability/loader parity qualification**.
Actual app/bootstrap/UI can then be exercised with a documented cached-library transport adapter only if approved.
No claim yet that this plan makes the full app boot; the first pass stopped before subsequent dependencies ran.

## CSS: byte-verified existing output candidate

Existing dispatch build asset (read-only):
`/home/user/Documents/GitHub/bitvid-dispatch/dist/css/tailwind.generated.css`,398371 bytes,
SHA256 `283d04642d201edba1e9bd5cbc3ede8d74fbd11b50ff0cd2732d463847d2adf3`.
Dispatch HEAD read as `8abbaa77b499cbf054ed55147815fb9403f702c3`.
Compared465 input files byte-for-byte against this QA checkout: **0 different inputs**.
Compared tailwind config content globs(index/embed/components/views/js/torrent), all source CSS except generated
output,postcss config,tailwind config,package.json and package-lock.json. The sorted[path,ownSHA256,dispatchSHA256]
JSON manifest SHA256 is `58743f25fc1ff7333c2bbc5b2aa9a60b3b833428b81e772bbbf3fe3e7b1b4177`.
`git diff 7f99c045..HEAD -- css tailwind.config.cjs postcss.config.cjs index.html embed.html components views js torrent package.json package-lock.json`
was empty; dispatch's prior verified preview build at7f99c045 has identical current relevant inputs.
No inference from commit names alone: this check compared actual files on disk.

Dispatch installed versions read: postcss8.5.6,postcss-cli11.0.1,postcss-import15.1.0,tailwindcss3.4.19,
autoprefixer10.4.24; esbuild0.27.3 also available in existing main dependencies.
No build was run. After approval, copy only this genuine CSS output into scratch after re-verifying output hash
and input equality, then serve the missing `/css/tailwind.generated.css` path from scratch. Do not modify
or regenerate another area's output. Alternative: later authorized own local CSS build; not needed if approved copy.
This is output reuse, not an independent fresh-build/release qualification.

## Existing harness and remaining dependencies

`tests/e2e/helpers/bitvidTestFixture.ts` supplies relay overrides,programmatic test-only login and synthetic event
seeding; no dedicated Buffer/CDN offline mapping was found by:
`rg -n 'route\(|routeWebSocket|buffer@6|cdn.jsdelivr' tests/e2e/helpers scripts/playwright` (no matches).
Do not rewrite helpers/config. `vendor/nostr-tools.bundle.min.js` is already local(110545 bytes),
SHA256 `2b063a02d0f449d715fc3bb892364c7a859f7c2e443af15321a2bcbd561c4e02`.
`js/nostrToolsBootstrap.js` attempts this local bundle and has public fallback imports; all unmatched fallbacks
must remain blocked. No toolkit mutation or claim that later dynamic dependency loading was verified.

## Integrity records

```json
[
  {
    "name": "buffer",
    "version": "6.0.3",
    "key": "make-fetch-happen:request-cache:https://registry.npmjs.org/buffer/-/buffer-6.0.3.tgz",
    "bytes": 23108,
    "cacheIntegrity": "sha512-FTiCpNxtwiZZHEZbcbTIcZjERVICn9yq/pDFkTl95/AxzD1naBctN7YO68riM/gLSDY7sdrMby8hofADYuuqOA==",
    "sha256": "555b6f49224afcf6b2c5a9aea7cd34a7f443f395b10532bc5580022d57aa51f5",
    "registryIntegrity": "sha512-FTiCpNxtwiZZHEZbcbTIcZjERVICn9yq/pDFkTl95/AxzD1naBctN7YO68riM/gLSDY7sdrMby8hofADYuuqOA==",
    "registryMatch": true,
    "file": "/tmp/bitvid-playback-qa-2-assets/buffer-6.0.3.tgz",
    "package": {
      "name": "buffer",
      "version": "6.0.3",
      "main": "index.js",
      "dependencies": {
        "base64-js": "^1.3.1",
        "ieee754": "^1.2.1"
      },
      "license": "MIT"
    },
    "indexSha256": "c25853fd31addfce188b01061fe85bfe667d5fb6c7a7bbb1c83d0ddfd8627acc"
  },
  {
    "name": "base64-js",
    "version": "1.5.1",
    "key": "make-fetch-happen:request-cache:https://registry.npmjs.org/base64-js/-/base64-js-1.5.1.tgz",
    "bytes": 4109,
    "cacheIntegrity": "sha512-AKpaYlHn8t4SVbOHCy+b5+KKgvR4vrsD8vbvrbiQJps7fKDTkjkDry6ji0rUJjC0kzbNePLwzxq8iypo41qeWA==",
    "sha256": "b1b7a945b52685269083425216d6597e33d97bf21699d656e92fdb3eb5210a85",
    "registryIntegrity": "sha512-AKpaYlHn8t4SVbOHCy+b5+KKgvR4vrsD8vbvrbiQJps7fKDTkjkDry6ji0rUJjC0kzbNePLwzxq8iypo41qeWA==",
    "registryMatch": true,
    "file": "/tmp/bitvid-playback-qa-2-assets/base64-js-1.5.1.tgz",
    "package": {
      "name": "base64-js",
      "version": "1.5.1",
      "main": "index.js",
      "dependencies": null,
      "license": "MIT"
    },
    "indexSha256": "829eadd8a1a441d25be0cb93b00e16a0d0c20fd294db95d8f2ed87e6954b7182"
  },
  {
    "name": "ieee754",
    "version": "1.2.1",
    "key": "make-fetch-happen:request-cache:https://registry.npmjs.org/ieee754/-/ieee754-1.2.1.tgz",
    "bytes": 2886,
    "cacheIntegrity": "sha512-dcyqhDvX1C46lXZcVqCpK+FtMRQVdIMN6/Df5js2zouUsqG7I6sFxitIC+7KYK29KdXOLHdu9zL4sFnoVQnqaA==",
    "sha256": "8ef14b9b397e339db89db97881fb714f49319d8f0eb1275901f45567b28f9dac",
    "registryIntegrity": "sha512-dcyqhDvX1C46lXZcVqCpK+FtMRQVdIMN6/Df5js2zouUsqG7I6sFxitIC+7KYK29KdXOLHdu9zL4sFnoVQnqaA==",
    "registryMatch": true,
    "file": "/tmp/bitvid-playback-qa-2-assets/ieee754-1.2.1.tgz",
    "package": {
      "name": "ieee754",
      "version": "1.2.1",
      "main": "index.js",
      "dependencies": null,
      "license": "BSD-3-Clause"
    },
    "indexSha256": "fe3e2b20c1ebb57c3b390c8f685ad1e04e6f493517fa7e432f4351bb77a1a4d0"
  }
]
```

## Offline cache-inspection script

Requires only existing system cacache; writes tarball copies/report to own scratch, no extraction/install/build.

```js
const cache = require('/usr/share/nodejs/cacache');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
(async()=>{
 const results=[];
 for(const [name,version] of [['buffer','6.0.3'],['base64-js','1.5.1'],['ieee754','1.2.1']]){
  const key=`make-fetch-happen:request-cache:https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`;
  const r=await cache.get('/home/user/.npm/_cacache',key);
  const actual='sha512-'+crypto.createHash('sha512').update(r.data).digest('base64');
  if(r.integrity!==actual)throw Error('cache integrity mismatch '+name);
  const file=`/tmp/bitvid-playback-qa-2-assets/${name}-${version}.tgz`;await fs.writeFile(file,r.data);
  let registryIntegrity=null;
  try{const p=await cache.get('/home/user/.npm/_cacache',`make-fetch-happen:request-cache:https://registry.npmjs.org/${name}`);registryIntegrity=JSON.parse(p.data).versions?.[version]?.dist?.integrity||null;}catch{}
  results.push({name,version,key,bytes:r.data.length,cacheIntegrity:r.integrity,sha256:crypto.createHash('sha256').update(r.data).digest('hex'),registryIntegrity,registryMatch:registryIntegrity===actual,file});
 }
 await fs.writeFile('/tmp/bitvid-playback-qa-2-assets/cache.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});

```

Current action: retain evidence/plan, no browser/full/build while storage holds the slot. Request dispatch review
of exact local fulfillment+verified CSS reuse, then a new bounded browser grant before executing any adapter/build.

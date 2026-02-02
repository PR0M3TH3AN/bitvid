To run:

```bash
node --import ../../../tests/test-helpers/setup-localstorage.mjs repro.mjs
```

Error: Cannot destructure property 'webSeed' of '(intermediate value)(intermediate value)(intermediate value)' as it is null.
Stack: TypeError: Cannot destructure property 'webSeed' of '(intermediate value)(intermediate value)(intermediate value)' as it is null.
    at normalizeAndAugmentMagnet (file:///app/js/magnetUtils.js:20:5)
    at fuzzNormalize (file:///app/scripts/agent/fuzz-magnetUtils.mjs:175:13)
    at file:///app/scripts/agent/fuzz-magnetUtils.mjs:205:1
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:665:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)
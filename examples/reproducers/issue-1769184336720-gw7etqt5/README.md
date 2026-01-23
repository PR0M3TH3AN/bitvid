To run:

```bash
node --import ../../../tests/test-helpers/setup-localstorage.mjs repro.mjs
```

Error: Cannot convert object to primitive value
Stack: TypeError: Cannot convert object to primitive value
    at String (<anonymous>)
    at buildWatchHistoryEvent (file:///app/js/nostrEventSchemas.js:2147:54)
    at fuzzFunction (file:///app/scripts/agent/fuzz-nostrEventSchemas.mjs:210:14)
    at file:///app/scripts/agent/fuzz-nostrEventSchemas.mjs:244:3
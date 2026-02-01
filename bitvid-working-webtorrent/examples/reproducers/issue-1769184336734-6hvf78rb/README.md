To run:

```bash
node --import ../../../tests/test-helpers/setup-localstorage.mjs repro.mjs
```

Error: Explosion!
Stack: Error: Explosion!
    at Object.toString (file:///app/scripts/agent/fuzz-nostrEventSchemas.mjs:103:29)
    at String (<anonymous>)
    at buildSubscriptionListEvent (file:///app/js/nostrEventSchemas.js:2183:54)
    at fuzzFunction (file:///app/scripts/agent/fuzz-nostrEventSchemas.mjs:210:14)
    at file:///app/scripts/agent/fuzz-nostrEventSchemas.mjs:244:3
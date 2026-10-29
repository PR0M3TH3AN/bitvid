# client-reliability-4 precommit gates

- `env -u NODE_TEST_CONTEXT node tests/url-health-lifecycle.test.mjs`: exit0,12/12 scenarios,0 failures/cancellations/skips. Inherited NODE_TEST_CONTEXT=child-v8 makes --test output misleading; direct self-executing test file yields named scenarios. No runner edit.
- `env -u NODE_TEST_CONTEXT node scripts/run-unit-tests.mjs url-health health-disposal`: exit0,4 files. New lifecycle12, URL controller4, multi-source4, view health disposal2 =22 scenarios.
- `python3 /tmp/item4-mutants.py`: final13/13 restored mutants naturally exit1 with named assertion failures, no timeout counted. Coverage in TEST_INTEGRITY.md; initial surviving callback/mirror variants led to stronger assertions before final run.
- `npm run lint`: sandbox exit2 at git grep EPERM; same command with approved subprocess access exits0,11 stages. No lint relaxation.
- `npm run build`: exit0, including deploy-artifact verification; pre-existing Browserslist age warning, dependencies unchanged.
- Browser ephemeral server initially denied listen EPERM; `node /tmp/item4-browser.mjs` with approved local access exits0: Chromium+Firefox each0 obsolete starts, healthy shared badge/disposed badge checking, hidden reveal, hosted/torrent source-health visibility pass,0 external requests/page errors. Owned loopback server/browser closed; preview3000 untouched. Full merged-tree suite and normal queue/durable ancestry still required.
- No CPU/RSS or actual playback/live peers/fallback qualification. Only external IO virtualized; browser cache boundary uses in-memory service virtualization, unit regression uses actual state/cache module.

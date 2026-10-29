# Dispatch URL cancellation reproduction

- Code HEAD604c8c61, worker reproduction copied to /tmp/bitvid-dispatch-4-url-lifecycle.mjs with root redirected to dispatch. Real controller/observer/cache, controlled fetch/media boundaries, no public traffic.
- node /tmp/bitvid-dispatch-4-url-lifecycle.mjs last-owner --expect-fixed: exit1, natural assertion1!==0 after cleanup. Before4 HEAD/3 active/1 queued; disposal retains queue; release starts1 obsolete media. Final settled4/active0/queued0.
- node /tmp/bitvid-dispatch-4-url-lifecycle.mjs shared-owner: exit0, live badge healthy, settled4/active0/queued0.
- No lint/full/browser tests rerun for reproduction; no product edits. Active abort/playback/CPU-RSS unverified.

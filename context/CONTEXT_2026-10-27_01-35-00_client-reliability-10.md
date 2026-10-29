# Client10 goal and scope

- Authority exact dispatch ROUTING-2026-10-27-client10-animation-cleanup.md read; sourcef01ce012 after safe ff, untracked client9 note preserved.
- Goal recover already-finished transient interface fade/delay classes during delayed cleanup init; preserve active/future interface animation and thumbnail end/cancel semantics. Existing listener-only cleanup cannot observe an event already dispatched.
- Done now: minimal index block extraction + helper, scenario/wiring regressions, killing mutants for all cases, lint under freshhealth. Fullgate/landing/build/nativebrowser are later explicit slots. No other bootstrap/CSS/app edits or oldoverflow closure.
- Plan: create/claim10; record contract/testintegrity; extract existing cleanup; reconcile finished own-target CSS interface animations with no stillactive counterpart; test real helper and extracted bootstrap wiring; isolated mutants; lint; namedpathcommit/merge and READY only, no submit.
- getAnimations/finished/fill reference https://www.w3.org/TR/web-animations-1/; finished forwards effects remain relevant and can retain stacking context. Avoid sleeps, timers, layout reads, arbitrary phase-duration guesses and broad class stripping.

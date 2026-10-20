# Item7 cold live feed notification

- Goal: cold cache then eligible live updates must notify actual loadVideos consumer;latest feed owns reused subscription and clear invalidates late callbacks.
- Scope: nostrService loadVideos notification state plus constructor/clear lifecycle only;new focused service test and unique evidence/backlog. No app/feed/filter/cache policy/runner changes.
- Plan: reproduce original service with controlled subscribeVideos boundary;prove latest/force/clear controls;minimal current-consumer token;mutants/focused/lint;explicit full slot then one unchanged normal gate;QA owns actual-app browser after landing/preview rebuild.
- Original4e904349: new first5 scenarios4fail1pass/0cancel;first8line callback fix later5pass2fail on7. Revised service19 added lines passes7/7. No actual browser/full/build yet.

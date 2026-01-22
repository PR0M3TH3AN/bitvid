import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8008;
const wss = new WebSocketServer({ port: PORT });

// Simple in-memory store for REQ matching
const events = [];
// In a real relay we would handle subscription updates, but for smoke tests
// we mostly do one-off queries or expect immediate results.
// We won't implement persistent subscription matching for new events here
// to keep it simple, unless needed (smoke test waits 500ms then fetches, so one-off is fine).

console.log(`Simple relay running on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (!Array.isArray(data)) return;

      const [type, ...payload] = data;

      if (type === 'EVENT') {
        const [event] = payload;

        // Validation check
        if (!event.id || !event.sig) {
            ws.send(JSON.stringify(['OK', event.id, false, 'invalid: missing id or sig']));
            return;
        }

        // Simulate storage
        events.push(event);
        if (events.length > 2000) events.shift(); // Keep memory low

        // Simulate relay processing time (random 5-50ms)
        setTimeout(() => {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify(['OK', event.id, true, 'saved']));
            }
        }, Math.random() * 45 + 5);

      } else if (type === 'REQ') {
        const subId = payload[0];
        const filters = payload.slice(1);
        console.log(`REQ ${subId}`, JSON.stringify(filters));

        // Simple match against stored events
        const matched = events.filter(event => {
            // Event matches if it matches ANY of the filters
            return filters.some(filter => {
                if (filter.ids && !filter.ids.includes(event.id)) return false;
                if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
                if (filter.authors && !filter.authors.includes(event.pubkey)) return false;

                // Tag matching (e.g. #p, #d, #t)
                for (const key in filter) {
                    if (key.startsWith('#')) {
                        const tagName = key.slice(1);
                        const tagValues = filter[key];
                        // Check if event has a tag [tagName, value] where value is in tagValues
                        const hasTag = event.tags && event.tags.some(t => t[0] === tagName && tagValues.includes(t[1]));
                        if (!hasTag) return false;
                    }
                }
                return true;
            });
        });

        console.log(`Matched ${matched.length} events for REQ ${subId}`);

        matched.forEach(event => {
             ws.send(JSON.stringify(['EVENT', subId, event]));
        });

        ws.send(JSON.stringify(['EOSE', subId]));

      } else if (type === 'CLOSE') {
          // No-op
      }
    } catch (e) {
      // ignore invalid JSON
      console.error(e);
    }
  });
});

import { WebSocketServer } from 'ws';
import { matchFilters } from 'nostr-tools';

const PORT = process.env.PORT || 3333;
const wss = new WebSocketServer({ port: PORT });

// In-memory event storage
const events = [];

// Map<ws, Map<subId, filters>>
const subscriptions = new Map();

console.log(`Simple Relay running on port ${PORT}`);

wss.on('connection', (ws) => {
  subscriptions.set(ws, new Map());

  ws.on('message', (message) => {
    try {
      const raw = message.toString(); // Ensure string
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        // Ignore malformed JSON
        return;
      }

      if (!Array.isArray(data)) return;

      const [type, ...payload] = data;

      if (type === 'EVENT') {
        const event = payload[0];
        if (!event || !event.id) return;

        // Dedup
        if (events.some(e => e.id === event.id)) {
          ws.send(JSON.stringify(['OK', event.id, true, 'duplicate']));
          return;
        }

        events.push(event);
        ws.send(JSON.stringify(['OK', event.id, true, '']));

        // Broadcast
        for (const [client, clientSubs] of subscriptions) {
          if (client.readyState !== 1) continue; // 1 = OPEN
          for (const [subId, filters] of clientSubs) {
            if (matchFilters(filters, event)) {
              client.send(JSON.stringify(['EVENT', subId, event]));
            }
          }
        }

      } else if (type === 'REQ') {
        const subId = payload[0];
        const filters = payload.slice(1);

        subscriptions.get(ws).set(subId, filters);

        // Send stored events
        for (const event of events) {
          if (matchFilters(filters, event)) {
            ws.send(JSON.stringify(['EVENT', subId, event]));
          }
        }
        ws.send(JSON.stringify(['EOSE', subId]));

      } else if (type === 'CLOSE') {
        const subId = payload[0];
        subscriptions.get(ws).delete(subId);
      }
    } catch (e) {
      console.error('Relay error:', e);
    }
  });

  ws.on('close', () => {
    subscriptions.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('Client error:', err);
  });
});

process.on('SIGINT', () => {
  wss.close();
  process.exit();
});

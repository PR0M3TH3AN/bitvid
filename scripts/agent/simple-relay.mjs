import { WebSocketServer } from 'ws';

const PORT = 8008;
const wss = new WebSocketServer({ port: PORT });

// Simple in-memory store for REQ matching
const events = [];
const subscriptions = new Map(); // subId -> ws

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
        if (events.length > 1000) events.shift(); // Keep memory low

        // Simulate relay processing time (random 5-50ms)
        setTimeout(() => {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify(['OK', event.id, true, 'saved']));
            }
        }, Math.random() * 45 + 5);

      } else if (type === 'REQ') {
        const [subId, filter] = payload;
        // Store subscription (simplified)
        // In a real relay we would match existing events here
        // For load test, we mostly care about the ACK of EVENTs
        ws.send(JSON.stringify(['EOSE', subId]));

      } else if (type === 'CLOSE') {
          // No-op
      }
    } catch (e) {
      // ignore invalid JSON
    }
  });
});

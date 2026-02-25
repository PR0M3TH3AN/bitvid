import { WebSocketServer } from 'ws';
import http from 'http';

const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const type = data[0];
      if (type === 'REQ') {
        const subId = data[1];
        ws.send(JSON.stringify(['EOSE', subId]));
      } else if (type === 'EVENT') {
        const event = data[1];
        ws.send(JSON.stringify(['OK', event.id, true, '']));
      }
    } catch (_err) {
      // ignore
    }
  });
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  console.log(`ws://127.0.0.1:${address.port}`);
});

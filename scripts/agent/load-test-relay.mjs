import { WebSocketServer } from "ws";
import { matchFilters } from "nostr-tools/filter";
import { fileURLToPath } from "url";

export function startRelay(port = 8889) {
  const wss = new WebSocketServer({ port });
  const events = new Map(); // id -> event
  const maxEvents = 10000;
  const subs = new Map(); // ws -> Map(subId -> filters)

  console.log(`Load Test Relay starting on port ${port}`);

  wss.on("connection", (ws) => {
    subs.set(ws, new Map());

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message);
        if (!Array.isArray(data)) return;

        const [type, ...payload] = data;

        if (type === "EVENT") {
          const event = payload[0];
          if (!event || !event.id) {
            ws.send(JSON.stringify(["NOTICE", "Invalid event"]));
            return;
          }

          if (!events.has(event.id)) {
            // Eviction logic
            if (events.size >= maxEvents) {
              const firstKey = events.keys().next().value;
              events.delete(firstKey);
            }

            events.set(event.id, event);

            // Broadcast to matching subs
            for (const [client, clientSubs] of subs.entries()) {
              if (client.readyState !== 1) continue; // OPEN
              for (const [subId, filters] of clientSubs.entries()) {
                if (matchFilters(filters, event)) {
                  client.send(JSON.stringify(["EVENT", subId, event]));
                }
              }
            }
          }

          ws.send(JSON.stringify(["OK", event.id, true, "saved"]));
        } else if (type === "REQ") {
          const subId = payload[0];
          const filters = payload.slice(1);

          if (typeof subId !== "string") return;

          subs.get(ws).set(subId, filters);

          // Send stored events
          for (const event of events.values()) {
            if (matchFilters(filters, event)) {
              ws.send(JSON.stringify(["EVENT", subId, event]));
            }
          }
          ws.send(JSON.stringify(["EOSE", subId]));
        } else if (type === "CLOSE") {
          const subId = payload[0];
          if (typeof subId === "string") {
            subs.get(ws).delete(subId);
          }
        } else if (type === "COUNT") {
          const subId = payload[0];
          // Dummy count support
          ws.send(JSON.stringify(["COUNT", subId, { count: 0 }]));
        }
      } catch (err) {
        // console.error("Relay error processing message:", err);
      }
    });

    ws.on("close", () => {
      subs.delete(ws);
    });

    ws.on("error", (err) => {
      console.error("Relay connection error:", err);
    });
  });

  return {
    close: () => {
      return new Promise((resolve) => {
        wss.close(resolve);
      });
    },
    port
  };
}

// Allow running standalone
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 8889;
  startRelay(port);
}

import { WebSocketServer } from "ws";
import { matchFilters } from "nostr-tools/filter";

export function startRelay(port = 8888) {
  const wss = new WebSocketServer({ port });
  const events = new Map(); // id -> event
  const maxEvents = 10000;
  const subs = new Map(); // ws -> Map(subId -> filters)

  console.log(`Simple relay starting on port ${port}`);

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

          // Basic validation (optional, but good for sanity)
          // We won't verify signature here to save CPU for the load test runner,
          // assuming the client does it. But a real relay would.
          // For load testing "relay writes", we primarily care about the I/O and handling overhead.

          if (!events.has(event.id)) {
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
        }
      } catch (err) {
        console.error("Relay error processing message:", err);
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
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startRelay(process.env.PORT ? parseInt(process.env.PORT) : 8888);
}

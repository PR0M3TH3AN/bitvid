import { WebSocketServer } from "ws";
import { createServer } from "http";
import { matchFilters } from "nostr-tools/filter";

/**
 * Start a simple in-memory Nostr relay with optional HTTP seeding API.
 *
 * @param {number} port - WebSocket port (default 8888)
 * @param {Object} [options]
 * @param {number} [options.httpPort] - HTTP API port for seeding events (default: port + 1)
 * @returns {{ close: () => Promise<void>, port: number, httpPort: number, seedEvent: (event) => void, getEvents: () => Map, clearEvents: () => void }}
 */
export function startRelay(port = 8888, options = {}) {
  const wss = new WebSocketServer({ port });
  const events = new Map(); // id -> event
  const subs = new Map(); // ws -> Map(subId -> filters)

  console.log(`Simple relay starting on port ${port}`);

  function broadcastEvent(event) {
    for (const [client, clientSubs] of subs.entries()) {
      if (client.readyState !== 1) continue; // OPEN
      for (const [subId, filters] of clientSubs.entries()) {
        if (matchFilters(filters, event)) {
          client.send(JSON.stringify(["EVENT", subId, event]));
        }
      }
    }
  }

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
            events.set(event.id, event);
            broadcastEvent(event);
          }

          ws.send(JSON.stringify(["OK", event.id, true, "saved"]));
        } else if (type === "REQ") {
          const subId = payload[0];
          const filters = payload.slice(1);

          if (typeof subId !== "string") return;

          subs.get(ws).set(subId, filters);

          // Send stored events matching the filter
          for (const event of events.values()) {
            if (matchFilters(filters, event)) {
              ws.send(JSON.stringify(["EVENT", subId, event]));
            }
          }
          ws.send(JSON.stringify(["EOSE", subId]));
        } else if (type === "CLOSE") {
          const subId = payload[0];
          if (typeof subId === "string") {
            subs.get(ws)?.delete(subId);
          }
        } else if (type === "COUNT") {
          const subId = payload[0];
          const filters = payload.slice(1);
          let count = 0;
          for (const event of events.values()) {
            if (matchFilters(filters, event)) {
              count++;
            }
          }
          ws.send(JSON.stringify(["COUNT", subId, { count }]));
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

  // --- Programmatic API for test seeding ---

  function seedEvent(event) {
    if (!event || !event.id) return false;
    if (!events.has(event.id)) {
      events.set(event.id, event);
      broadcastEvent(event);
    }
    return true;
  }

  function clearEvents() {
    events.clear();
  }

  function getEvents() {
    return events;
  }

  // --- Optional HTTP API for seeding events from Playwright tests ---

  let httpServer = null;
  const httpPort = options.httpPort ?? port + 1;

  if (options.httpPort !== false) {
    httpServer = createServer((req, res) => {
      // CORS headers for test environments
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "POST" && req.url === "/seed") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            const eventsToSeed = Array.isArray(payload) ? payload : [payload];
            const seeded = [];
            for (const event of eventsToSeed) {
              if (seedEvent(event)) {
                seeded.push(event.id);
              }
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, seeded }));
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }

      if (req.method === "GET" && req.url === "/events") {
        const all = Array.from(events.values());
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(all));
        return;
      }

      if (req.method === "DELETE" && req.url === "/events") {
        clearEvents();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            eventCount: events.size,
            connectionCount: wss.clients.size,
          }),
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

    httpServer.listen(httpPort, () => {
      console.log(`Relay HTTP API listening on port ${httpPort}`);
    });
  }

  return {
    close: () => {
      return new Promise((resolve) => {
        const closeHttp = httpServer
          ? new Promise((r) => httpServer.close(r))
          : Promise.resolve();
        closeHttp.then(() => wss.close(resolve));
      });
    },
    port,
    httpPort: httpServer ? httpPort : null,
    seedEvent,
    getEvents,
    clearEvents,
  };
}

// Allow running standalone
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startRelay(process.env.PORT ? parseInt(process.env.PORT) : 8888);
}

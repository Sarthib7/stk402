import { createServer, type Server } from "node:http";

export function createHandlerServer(
  handler: (request: Request) => Promise<Response>,
): Server {
  return createServer(async (incoming, outgoing) => {
    try {
      const host = incoming.headers.host;
      if (!host || !incoming.url) {
        outgoing.writeHead(400).end();
        return;
      }

      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) headers.append(name, item);
        } else if (value !== undefined) {
          headers.set(name, value);
        }
      }

      const response = await handler(
        new Request(`http://${host}${incoming.url}`, {
          method: incoming.method ?? "GET",
          headers,
        }),
      );
      response.headers.forEach((value, name) => outgoing.setHeader(name, value));
      outgoing.writeHead(response.status);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ error: "internal_error" }));
    }
  });
}

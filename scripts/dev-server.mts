// Server locale per provare le funzioni senza Vercel.
// Uso: DATABASE_URL=... DATABASE_SSL=disable LEADS_API_KEY=... npx tsx scripts/dev-server.mts [porta]
import http from "node:http";

const routes: [RegExp, string][] = [
  [/^\/api\/health$/, "../api/health.ts"],
  [/^\/api\/keepalive$/, "../api/keepalive.ts"],
  [/^\/api\/leads$/, "../api/leads.ts"],
  [/^\/api\/mandates$/, "../api/mandates/index.ts"],
  [/^\/api\/mandates\/([^/]+)$/, "../api/mandates/[id].ts"],
];

const port = Number(process.argv[2] ?? 3055);

http
  .createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const found = routes.map(([pattern, file]) => [pattern.exec(url.pathname), file] as const).find(([m]) => m);
    if (!found) {
      response.writeHead(404).end();
      return;
    }
    const [match, file] = found;

    // Corpo JSON, come lo prepara Vercel.
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    let body: unknown = undefined;
    if (chunks.length > 0) {
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        body = undefined;
      }
    }

    // Oggetti req/res con la stessa forma minima usata dalle funzioni.
    const req = { method: request.method, headers: request.headers, body, query: match![1] ? { id: match![1] } : {} };
    const res = {
      setHeader: (name: string, value: string) => response.setHeader(name, value),
      status(code: number) {
        response.statusCode = code;
        return res;
      },
      json(payload: unknown) {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(payload));
        return res;
      },
      end: () => response.end(),
    };

    const { default: handler } = await import(file);
    await handler(req, res);
  })
  .listen(port, "127.0.0.1", () => console.log(`In ascolto su http://127.0.0.1:${port}`));

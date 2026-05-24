type RouteHandler = (req: Request, params: Record<string, string>) => Promise<Response> | Response;

interface Route {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, handler: RouteHandler): void {
    const segments = path.split("/").filter(Boolean);
    this.routes.push({ method: method.toUpperCase(), segments, handler });
  }

  get(path: string, handler: RouteHandler): void {
    this.add("GET", path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.add("POST", path, handler);
  }

  put(path: string, handler: RouteHandler): void {
    this.add("PUT", path, handler);
  }

  delete(path: string, handler: RouteHandler): void {
    this.add("DELETE", path, handler);
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const file = Bun.file("public/index.html");
      if (await file.exists()) {
        return new Response(file, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    }

    const pathSegments = url.pathname.split("/").filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      if (route.segments.length !== pathSegments.length) continue;

      const params: Record<string, string> = {};
      let matched = true;

      for (let i = 0; i < route.segments.length; i++) {
        const routeSeg = route.segments[i];
        const pathSeg = pathSegments[i];

        if (routeSeg.startsWith(":")) {
          params[routeSeg.slice(1)] = pathSeg;
        } else if (routeSeg !== pathSeg) {
          matched = false;
          break;
        }
      }

      if (matched) {
        try {
          return await route.handler(req, params);
        } catch (err) {
          console.error(`[Router] Error handling ${req.method} ${url.pathname}:`, err);
          return jsonResponse({ error: "Internal server error" }, 500);
        }
      }
    }

    return jsonResponse({ error: "Not found" }, 404);
  }
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function parseBody<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Empty request body");
  return JSON.parse(text) as T;
}

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { unlinkSync } from "fs";

const TEST_DB = "./data/test-media-server.db";
const API_PORT = 18080;

// Clean slate: remove old test DB
try { unlinkSync(TEST_DB); } catch {}

// Override env before importing modules
process.env.DB_PATH = TEST_DB;
process.env.API_PORT = String(API_PORT);

import { getDb, closeDb } from "./db";
import { Router } from "./api/router";
import { registerStreamRoutes } from "./api/streams";
import { registerMetricsRoutes } from "./api/metrics";

const BASE = `http://localhost:${API_PORT}`;
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  getDb();
  const router = new Router();
  registerStreamRoutes(router);
  registerMetricsRoutes(router);
  server = Bun.serve({ port: API_PORT, fetch: (req) => router.handle(req) });
});

afterAll(() => {
  server.stop();
  closeDb();
  try { unlinkSync(TEST_DB); } catch {}
});

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

describe("Health", () => {
  test("GET /api/health returns ok", async () => {
    const { status, data } = await api("GET", "/api/health");
    expect(status).toBe(200);
    expect(data.status).toBe("ok");
  });
});

describe("Stream CRUD", () => {
  let streamId: string;

  test("POST /api/streams creates a stream", async () => {
    const { status, data } = await api("POST", "/api/streams", {
      name: "Test Stream",
      passphrase: "test-passphrase-ok",
    });
    expect(status).toBe(201);
    expect(data.name).toBe("Test Stream");
    expect(data.listenPort).toBeGreaterThanOrEqual(10000);
    expect(data.streamKey).toBeDefined();
    streamId = data.id;
  });

  test("POST /api/streams validates passphrase length", async () => {
    const { status, data } = await api("POST", "/api/streams", {
      name: "Bad",
      passphrase: "short",
    });
    expect(status).toBe(400);
    expect(data.error).toContain("at least 10");
  });

  test("GET /api/streams lists all streams", async () => {
    const { status, data } = await api("GET", "/api/streams");
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  test("GET /api/streams/:id returns stream with outputs", async () => {
    const { status, data } = await api("GET", `/api/streams/${streamId}`);
    expect(status).toBe(200);
    expect(data.id).toBe(streamId);
    expect(data.outputs).toBeDefined();
  });

  test("PUT /api/streams/:id updates stream", async () => {
    const { status, data } = await api("PUT", `/api/streams/${streamId}`, {
      name: "Updated Stream",
      latencyMs: 3000,
    });
    expect(status).toBe(200);
    expect(data.name).toBe("Updated Stream");
    expect(data.latencyMs).toBe(3000);
  });

  test("GET /api/streams/:id returns 404 for nonexistent", async () => {
    const { status } = await api("GET", "/api/streams/nonexistent");
    expect(status).toBe(404);
  });

  test("auto-allocates sequential ports", async () => {
    const { data: s2 } = await api("POST", "/api/streams", {
      name: "Stream 2",
      passphrase: "passphrase-stream-2",
    });
    const { data: s3 } = await api("POST", "/api/streams", {
      name: "Stream 3",
      passphrase: "passphrase-stream-3",
    });

    expect(s3.listenPort).toBe(s2.listenPort + 1);

    // Cleanup
    await api("DELETE", `/api/streams/${s2.id}`);
    await api("DELETE", `/api/streams/${s3.id}`);
  });
});

describe("Output CRUD", () => {
  let streamId: string;
  let outputId: string;

  beforeAll(async () => {
    const { data } = await api("POST", "/api/streams", {
      name: "Output Test Stream",
      passphrase: "output-test-passphrase",
    });
    streamId = data.id;
  });

  afterAll(async () => {
    await api("DELETE", `/api/streams/${streamId}`);
  });

  test("POST relay output auto-allocates relay port", async () => {
    const { status, data } = await api("POST", `/api/streams/${streamId}/outputs`, {
      name: "OBS Relay",
      protocol: "srt",
      mode: "relay",
    });
    expect(status).toBe(201);
    expect(data.mode).toBe("relay");
    expect(data.relayPort).toBeGreaterThanOrEqual(10050);
    outputId = data.id;
  });

  test("POST push output requires url", async () => {
    const { status, data } = await api("POST", `/api/streams/${streamId}/outputs`, {
      name: "Bad Push",
      protocol: "srt",
      mode: "push",
    });
    expect(status).toBe(400);
    expect(data.error).toContain("url is required");
  });

  test("POST push output works with url", async () => {
    const { status, data } = await api("POST", `/api/streams/${streamId}/outputs`, {
      name: "Backup SRT",
      protocol: "srt",
      mode: "push",
      url: "srt://backup:9000",
    });
    expect(status).toBe(201);
    expect(data.mode).toBe("push");
    expect(data.url).toBe("srt://backup:9000");
  });

  test("PUT /api/outputs/:id updates output", async () => {
    const { status, data } = await api("PUT", `/api/outputs/${outputId}`, {
      name: "Updated Relay",
    });
    expect(status).toBe(200);
    expect(data.name).toBe("Updated Relay");
  });

  test("GET /api/streams/:id/outputs lists outputs", async () => {
    const { status, data } = await api("GET", `/api/streams/${streamId}/outputs`);
    expect(status).toBe(200);
    expect(data.length).toBe(2);
  });

  test("DELETE /api/outputs/:id removes output", async () => {
    const { status, data } = await api("DELETE", `/api/outputs/${outputId}`);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});

describe("Metrics", () => {
  test("GET /api/metrics returns summary", async () => {
    const { status, data } = await api("GET", "/api/metrics");
    expect(status).toBe(200);
    expect(data.totalStreams).toBeDefined();
    expect(data.streams).toBeDefined();
  });

  test("GET /api/streams/:id/metrics returns empty for inactive stream", async () => {
    const { data: stream } = await api("POST", "/api/streams", {
      name: "Metrics Test",
      passphrase: "metrics-test-pass",
    });
    const { status, data } = await api("GET", `/api/streams/${stream.id}/metrics`);
    expect(status).toBe(200);
    expect(data.status).toBe("inactive");
    expect(data.current).toBeNull();
    await api("DELETE", `/api/streams/${stream.id}`);
  });
});

describe("Stream Lifecycle", () => {
  let streamId: string;

  beforeAll(async () => {
    const { data } = await api("POST", "/api/streams", {
      name: "Lifecycle Test",
      passphrase: "lifecycle-test-pass",
    });
    streamId = data.id;
  });

  afterAll(async () => {
    await api("DELETE", `/api/streams/${streamId}`);
  });

  test("start fails without outputs", async () => {
    const { status, data } = await api("POST", `/api/streams/${streamId}/start`);
    expect(status).toBe(400);
    expect(data.error).toContain("no enabled outputs");
  });

  test("start fails when ffmpeg is not available (graceful error)", async () => {
    await api("POST", `/api/streams/${streamId}/outputs`, {
      name: "Relay",
      protocol: "srt",
      mode: "relay",
    });
    const { status, data } = await api("POST", `/api/streams/${streamId}/start`);
    expect(status).toBe(400);
    expect(data.error).toContain("FFmpeg");
  });

  test("stop returns error when not running", async () => {
    const { status, data } = await api("POST", `/api/streams/${streamId}/stop`);
    expect(status).toBe(400);
    expect(data.error).toContain("not running");
  });
});

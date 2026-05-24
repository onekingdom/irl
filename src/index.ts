import { config } from "./config";
import { getDb, closeDb } from "./db";
import { Router } from "./api/router";
import { registerStreamRoutes } from "./api/streams";
import { registerMetricsRoutes } from "./api/metrics";
import { streamManager } from "./streams/manager";
import { verifyFfmpeg } from "./preflight";

// Verify FFmpeg is available with SRT support (skip in dev if not installed)
if (process.env.SKIP_FFMPEG_CHECK !== "1") {
  await verifyFfmpeg();
}

// Initialize database
getDb();
console.log(`[DB] SQLite database initialized at ${config.dbPath}`);

// Build router
const router = new Router();
registerStreamRoutes(router);
registerMetricsRoutes(router);

// Start HTTP server
const server = Bun.serve({
  port: config.apiPort,
  fetch: (req) => router.handle(req),
});

console.log(`[Server] IRL Media Server listening on http://localhost:${server.port}`);
console.log(`[Server] SRT input port range: ${config.srtInputPortStart}-${config.srtInputPortEnd}`);
console.log(`[Server] SRT relay port range: ${config.srtRelayPortStart}-${config.srtRelayPortEnd}`);

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Server] Received ${signal}, shutting down...`);
  await streamManager.stopAll();
  server.stop();
  closeDb();
  console.log("[Server] Shutdown complete");
  process.exit(0); // eslint-disable-line no-process-exit
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

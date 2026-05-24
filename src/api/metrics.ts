import { Router, jsonResponse } from "./router";
import { metricsStore } from "../metrics/store";
import { getStreamById } from "../db";

export function registerMetricsRoutes(router: Router): void {
  router.get("/api/streams/:id/metrics", (_req, params) => {
    const stream = getStreamById(params.id);
    if (!stream) {
      return jsonResponse({ error: "Stream not found" }, 404);
    }

    const metrics = metricsStore.getStreamMetrics(params.id);
    if (!metrics) {
      return jsonResponse({
        streamId: params.id,
        status: stream.status,
        current: null,
        uptimeSeconds: 0,
        connectedAt: null,
        history: [],
        aggregated: null,
      });
    }

    return jsonResponse(metrics);
  });

  router.get("/api/metrics", () => {
    const summary = metricsStore.getAllMetrics();
    return jsonResponse(summary);
  });

  router.get("/api/health", () => {
    const summary = metricsStore.getAllMetrics();
    return jsonResponse({
      status: "ok",
      uptime: process.uptime(),
      totalStreams: summary.totalStreams,
      activeStreams: summary.activeStreams,
      liveStreams: summary.liveStreams,
    });
  });
}

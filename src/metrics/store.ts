import { MetricsCollector } from "./collector";
import type { StreamMetrics, AllMetricsSummary } from "./types";

class MetricsStore {
  private collectors = new Map<string, MetricsCollector>();

  getOrCreate(streamId: string): MetricsCollector {
    let collector = this.collectors.get(streamId);
    if (!collector) {
      collector = new MetricsCollector();
      this.collectors.set(streamId, collector);
    }
    return collector;
  }

  get(streamId: string): MetricsCollector | undefined {
    return this.collectors.get(streamId);
  }

  remove(streamId: string): void {
    this.collectors.delete(streamId);
  }

  getStreamMetrics(streamId: string): StreamMetrics | null {
    const collector = this.collectors.get(streamId);
    if (!collector) return null;
    return collector.getMetrics(streamId);
  }

  getAllMetrics(): AllMetricsSummary {
    const streams: StreamMetrics[] = [];
    let activeStreams = 0;
    let liveStreams = 0;

    for (const [streamId, collector] of this.collectors) {
      const metrics = collector.getMetrics(streamId);
      streams.push(metrics);
      if (metrics.status !== "inactive") activeStreams++;
      if (metrics.status === "live") liveStreams++;
    }

    return {
      totalStreams: this.collectors.size,
      activeStreams,
      liveStreams,
      streams,
    };
  }
}

export const metricsStore = new MetricsStore();

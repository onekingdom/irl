import type { MetricSnapshot, StreamMetrics, AggregatedMetrics } from "./types";

const RING_BUFFER_SIZE = 300; // ~5 minutes at 1 snapshot/sec

export class MetricsCollector {
  private snapshots: MetricSnapshot[] = [];
  private current: MetricSnapshot | null = null;
  private connectedAt: number | null = null;
  private _status: string = "inactive";
  private cumulativeDroppedFrames = 0;

  get status(): string {
    return this._status;
  }

  set status(value: string) {
    this._status = value;
  }

  markConnected(): void {
    this.connectedAt = Date.now();
    this._status = "live";
  }

  markDisconnected(): void {
    this.connectedAt = null;
    this._status = "listening";
    this.current = null;
  }

  markInactive(): void {
    this.connectedAt = null;
    this._status = "inactive";
    this.current = null;
    this.snapshots = [];
    this.cumulativeDroppedFrames = 0;
  }

  pushSnapshot(snapshot: MetricSnapshot): void {
    this.current = snapshot;
    this.cumulativeDroppedFrames += snapshot.droppedFrames;

    this.snapshots.push(snapshot);
    if (this.snapshots.length > RING_BUFFER_SIZE) {
      this.snapshots.shift();
    }
  }

  getMetrics(streamId: string): StreamMetrics {
    const uptimeSeconds = this.connectedAt
      ? Math.floor((Date.now() - this.connectedAt) / 1000)
      : 0;

    return {
      streamId,
      status: this._status,
      current: this.current,
      uptimeSeconds,
      connectedAt: this.connectedAt,
      history: [...this.snapshots],
      aggregated: this.computeAggregated(),
    };
  }

  private computeAggregated(): AggregatedMetrics | null {
    if (this.snapshots.length === 0) return null;

    let totalBitrate = 0;
    let totalFps = 0;
    let minFps = Infinity;
    let maxFps = -Infinity;

    for (const s of this.snapshots) {
      totalBitrate += s.bitrateKbps;
      totalFps += s.fps;
      if (s.fps < minFps) minFps = s.fps;
      if (s.fps > maxFps) maxFps = s.fps;
    }

    const count = this.snapshots.length;

    return {
      avgBitrateKbps: Math.round((totalBitrate / count) * 100) / 100,
      minFps: minFps === Infinity ? 0 : minFps,
      maxFps: maxFps === -Infinity ? 0 : maxFps,
      avgFps: Math.round((totalFps / count) * 100) / 100,
      totalDroppedFrames: this.cumulativeDroppedFrames,
    };
  }
}

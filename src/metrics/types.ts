export interface MetricSnapshot {
  timestamp: number;
  fps: number;
  bitrateKbps: number;
  speed: number;
  totalFrames: number;
  totalSize: number;
  time: string;
  droppedFrames: number;
}

export interface StreamMetrics {
  streamId: string;
  status: string;
  current: MetricSnapshot | null;
  uptimeSeconds: number;
  connectedAt: number | null;
  history: MetricSnapshot[];
  aggregated: AggregatedMetrics | null;
}

export interface AggregatedMetrics {
  avgBitrateKbps: number;
  minFps: number;
  maxFps: number;
  avgFps: number;
  totalDroppedFrames: number;
}

export interface AllMetricsSummary {
  totalStreams: number;
  activeStreams: number;
  liveStreams: number;
  streams: StreamMetrics[];
}

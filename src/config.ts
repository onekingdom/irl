export const config = {
  apiPort: Number(process.env.API_PORT) || 8080,

  srtInputPortStart: Number(process.env.SRT_INPUT_PORT_START) || 10000,
  srtInputPortEnd: Number(process.env.SRT_INPUT_PORT_END) || 10049,

  srtRelayPortStart: Number(process.env.SRT_RELAY_PORT_START) || 10050,
  srtRelayPortEnd: Number(process.env.SRT_RELAY_PORT_END) || 10099,

  defaultSrtLatencyMs: Number(process.env.DEFAULT_SRT_LATENCY_MS) || 2000,

  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",

  dbPath: process.env.DB_PATH || "./data/media-server.db",
  logDir: process.env.LOG_DIR || "./data/logs",
} as const;

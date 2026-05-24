import { config } from "../config";
import type { MetricSnapshot } from "../metrics/types";

export type ProcessEvent =
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "metrics"; data: MetricSnapshot }
  | { type: "error"; message: string }
  | { type: "exit"; code: number | null };

export type ProcessEventHandler = (event: ProcessEvent) => void;

const PROGRESS_REGEX =
  /frame=\s*(\d+)\s+fps=\s*([\d.]+)\s+.*?L?size=\s*(\d+)\S*\s+time=\s*([\d:.]+)\s+bitrate=\s*([^\s]+)kbits\/s\s+speed=\s*([^\s]+?)x?\s*$/;

const CONNECTION_PATTERNS = [
  /Connection to .* established/i,
  /Opening .* for reading/i,
  /Input #0/i,
  /Stream mapping/i,
  /Output #0/i,
];

const DISCONNECTION_PATTERNS = [
  /Connection reset/i,
  /Broken pipe/i,
  /End of file/i,
  /Connection timed out/i,
];

export class FFmpegProcess {
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private handler: ProcessEventHandler;
  private lastFrameCount = 0;
  private stderrBuffer = "";
  private _running = false;

  constructor(handler: ProcessEventHandler) {
    this.handler = handler;
  }

  get running(): boolean {
    return this._running;
  }

  get pid(): number | undefined {
    return this.proc?.pid;
  }

  async start(args: string[]): Promise<void> {
    if (this._running) {
      throw new Error("Process is already running");
    }

    const cmd = [config.ffmpegPath, ...args];

    this.proc = Bun.spawn(cmd, {
      stdout: "ignore",
      stderr: "pipe",
      stdin: "ignore",
    });

    this._running = true;

    this.readStderr();

    this.proc.exited.then((code) => {
      this._running = false;
      this.handler({ type: "exit", code });
    });
  }

  async stop(timeoutMs = 5000): Promise<void> {
    if (!this.proc || !this._running) return;

    this.proc.kill("SIGTERM");

    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (this._running && this.proc) {
          this.proc.kill("SIGKILL");
        }
        resolve();
      }, timeoutMs);
    });

    await Promise.race([this.proc.exited, timeout]);
    this._running = false;
  }

  private async readStderr(): Promise<void> {
    const stderr = this.proc?.stderr;
    if (!stderr || typeof stderr === "number") return;

    const reader = stderr.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        this.stderrBuffer += decoder.decode(value, { stream: true });
        this.processBuffer();
      }
    } catch {
      // stream closed
    }
  }

  private processBuffer(): void {
    const lines = this.stderrBuffer.split(/\r?\n|\r/);
    // Keep the last incomplete line in the buffer
    this.stderrBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      this.parseLine(line);
    }
  }

  private parseLine(line: string): void {
    const progressMatch = line.match(PROGRESS_REGEX);
    if (progressMatch) {
      const totalFrames = parseInt(progressMatch[1], 10) || 0;
      const fps = parseFloat(progressMatch[2]) || 0;
      const totalSize = parseInt(progressMatch[3], 10) || 0;
      const time = progressMatch[4];
      const bitrateKbps = parseFloat(progressMatch[5]) || 0;
      const speed = parseFloat(progressMatch[6]) || 0;

      const droppedFrames = this.estimateDroppedFrames(totalFrames, fps);
      this.lastFrameCount = totalFrames;

      const snapshot: MetricSnapshot = {
        timestamp: Date.now(),
        fps,
        bitrateKbps,
        speed,
        totalFrames,
        totalSize,
        time,
        droppedFrames,
      };

      this.handler({ type: "metrics", data: snapshot });
      return;
    }

    for (const pattern of CONNECTION_PATTERNS) {
      if (pattern.test(line)) {
        this.handler({ type: "connected" });
        return;
      }
    }

    for (const pattern of DISCONNECTION_PATTERNS) {
      if (pattern.test(line)) {
        this.handler({ type: "disconnected" });
        return;
      }
    }

    if (/error/i.test(line) && !/error_resilience/i.test(line)) {
      this.handler({ type: "error", message: line.trim() });
    }
  }

  private estimateDroppedFrames(currentFrames: number, currentFps: number): number {
    if (this.lastFrameCount === 0 || currentFps <= 0) return 0;
    const frameDiff = currentFrames - this.lastFrameCount;
    if (frameDiff <= 0) return 0;
    // Rough estimate: if we got fewer frames than expected at this fps over ~1 second
    const expectedFrames = Math.round(currentFps);
    return Math.max(0, expectedFrames - frameDiff);
  }
}

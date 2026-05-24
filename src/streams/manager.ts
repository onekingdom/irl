import { FFmpegProcess, type ProcessEvent } from "./process";
import { buildPipelineArgs } from "./pipeline";
import { metricsStore } from "../metrics/store";
import {
  getStreamById,
  getEnabledOutputsByStreamId,
  updateStreamStatus,
} from "../db";

interface ManagedStream {
  streamId: string;
  process: FFmpegProcess;
  autoRestart: boolean;
  restartCount: number;
  maxRestarts: number;
}

class StreamManager {
  private streams = new Map<string, ManagedStream>();

  async start(streamId: string): Promise<{ success: boolean; error?: string }> {
    if (this.streams.has(streamId)) {
      return { success: false, error: "Stream is already running" };
    }

    const stream = getStreamById(streamId);
    if (!stream) {
      return { success: false, error: "Stream not found" };
    }

    const outputs = getEnabledOutputsByStreamId(streamId);
    if (outputs.length === 0) {
      return { success: false, error: "Stream has no enabled outputs. Add at least one output before starting." };
    }

    const args = buildPipelineArgs(stream, outputs);
    console.log(`[StreamManager] FFmpeg command: ffmpeg ${args.join(" ")}`);
    const collector = metricsStore.getOrCreate(streamId);
    collector.status = "listening";

    const ffmpeg = new FFmpegProcess((event: ProcessEvent) => {
      this.handleEvent(streamId, event);
    });

    const managed: ManagedStream = {
      streamId,
      process: ffmpeg,
      autoRestart: true,
      restartCount: 0,
      maxRestarts: 5,
    };

    this.streams.set(streamId, managed);

    try {
      await ffmpeg.start(args);
      updateStreamStatus(streamId, "listening");
      console.log(`[StreamManager] Stream ${streamId} started, listening on port ${stream.listenPort}`);
      return { success: true };
    } catch (err) {
      this.streams.delete(streamId);
      collector.markInactive();
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to start FFmpeg: ${message}` };
    }
  }

  async stop(streamId: string): Promise<{ success: boolean; error?: string }> {
    const managed = this.streams.get(streamId);
    if (!managed) {
      return { success: false, error: "Stream is not running" };
    }

    managed.autoRestart = false;
    await managed.process.stop();
    this.streams.delete(streamId);

    updateStreamStatus(streamId, "inactive");
    const collector = metricsStore.get(streamId);
    if (collector) collector.markInactive();

    console.log(`[StreamManager] Stream ${streamId} stopped`);
    return { success: true };
  }

  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.streams.keys()).map((id) => this.stop(id));
    await Promise.allSettled(stopPromises);
  }

  isRunning(streamId: string): boolean {
    return this.streams.has(streamId);
  }

  getRunningStreamIds(): string[] {
    return Array.from(this.streams.keys());
  }

  private handleEvent(streamId: string, event: ProcessEvent): void {
    const collector = metricsStore.get(streamId);

    switch (event.type) {
      case "connected":
        console.log(`[StreamManager] Stream ${streamId}: encoder connected`);
        updateStreamStatus(streamId, "live");
        collector?.markConnected();
        break;

      case "disconnected":
        console.log(`[StreamManager] Stream ${streamId}: encoder disconnected`);
        updateStreamStatus(streamId, "listening");
        collector?.markDisconnected();
        break;

      case "metrics":
        collector?.pushSnapshot(event.data);
        break;

      case "error":
        console.error(`[StreamManager] Stream ${streamId} error: ${event.message}`);
        break;

      case "exit":
        console.log(`[StreamManager] Stream ${streamId}: FFmpeg exited with code ${event.code}`);
        this.handleExit(streamId, event.code);
        break;
    }
  }

  private async handleExit(streamId: string, code: number | null): Promise<void> {
    const managed = this.streams.get(streamId);
    if (!managed) return;

    const collector = metricsStore.get(streamId);

    if (managed.autoRestart && managed.restartCount < managed.maxRestarts) {
      managed.restartCount++;
      console.log(
        `[StreamManager] Auto-restarting stream ${streamId} (attempt ${managed.restartCount}/${managed.maxRestarts})`
      );

      const stream = getStreamById(streamId);
      if (!stream) {
        this.streams.delete(streamId);
        collector?.markInactive();
        return;
      }

      const outputs = getEnabledOutputsByStreamId(streamId);
      if (outputs.length === 0) {
        this.streams.delete(streamId);
        collector?.markInactive();
        updateStreamStatus(streamId, "inactive");
        return;
      }

      const args = buildPipelineArgs(stream, outputs);
      collector?.markDisconnected();

      // Brief delay before restart
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        await managed.process.start(args);
        updateStreamStatus(streamId, "listening");
      } catch (err) {
        console.error(`[StreamManager] Failed to restart stream ${streamId}:`, err);
        this.streams.delete(streamId);
        collector?.markInactive();
        updateStreamStatus(streamId, "inactive");
      }
    } else {
      this.streams.delete(streamId);
      collector?.markInactive();
      updateStreamStatus(streamId, "inactive");
      console.log(`[StreamManager] Stream ${streamId} stopped (no more restarts)`);
    }
  }
}

export const streamManager = new StreamManager();

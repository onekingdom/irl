import type { Stream, StreamOutput } from "./types";

export function buildPipelineArgs(stream: Stream, outputs: StreamOutput[]): string[] {
  const args: string[] = [];

  args.push("-hide_banner");
  args.push("-loglevel", "info");
  args.push("-stats");
  args.push("-stats_period", "1");

  // Input: SRT listener
  const latencyUs = stream.latencyMs * 1000;
  const inputUrl = `srt://0.0.0.0:${stream.listenPort}?mode=listener&passphrase=${encodeURIComponent(stream.passphrase)}&latency=${latencyUs}`;
  args.push("-i", inputUrl);

  // Build outputs
  for (const output of outputs) {
    if (!output.enabled) continue;

    if (output.protocol === "ndi") {
      // NDI requires raw video frames -- always decode + output as uyvy422
      args.push("-pix_fmt", "uyvy422");
      args.push("-f", "libndi_newtek", output.ndiName ?? output.name);
    } else {
      if (output.codecMode === "copy") {
        args.push("-c", "copy");
      } else {
        args.push("-c:v", "libx264");
        args.push("-preset", "veryfast");
        args.push("-b:v", "4500k");
        args.push("-c:a", "aac");
        args.push("-b:a", "160k");
      }

      const outputUrl = buildOutputUrl(output);
      const format = getOutputFormat(output);
      args.push("-f", format, outputUrl);
    }
  }

  return args;
}

function buildOutputUrl(output: StreamOutput): string {
  if (output.mode === "relay") {
    const parts = [`srt://0.0.0.0:${output.relayPort}?mode=listener`];
    if (output.passphrase) {
      parts[0] += `&passphrase=${encodeURIComponent(output.passphrase)}`;
    }
    parts[0] += "&latency=500000";
    return parts[0];
  }

  // Push mode
  return output.url ?? "";
}

function getOutputFormat(output: StreamOutput): string {
  switch (output.protocol) {
    case "srt":
      return "mpegts";
    case "rtmp":
      return "flv";
    default:
      return "mpegts";
  }
}

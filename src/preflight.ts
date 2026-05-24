import { config } from "./config";

export async function verifyFfmpeg(): Promise<void> {
  // Check FFmpeg exists
  let versionOutput: string;
  try {
    const proc = Bun.spawn([config.ffmpegPath, "-version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    versionOutput = await new Response(proc.stdout).text();
    await proc.exited;
  } catch {
    console.error(`[Preflight] FFmpeg not found at "${config.ffmpegPath}"`);
    console.error("[Preflight] Install FFmpeg or set FFMPEG_PATH in your environment.");
    process.exit(1);
  }

  const versionLine = versionOutput.split("\n")[0] ?? "";
  console.log(`[Preflight] ${versionLine}`);

  // Check SRT protocol support
  let protocolOutput: string;
  try {
    const proc = Bun.spawn([config.ffmpegPath, "-protocols"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    protocolOutput = await new Response(proc.stdout).text();
    await proc.exited;
  } catch {
    protocolOutput = "";
  }

  const hasSrt = /^\s+srt$/m.test(protocolOutput) || /^\s+libsrt$/m.test(protocolOutput);
  if (!hasSrt) {
    console.error("[Preflight] FFmpeg was found but does NOT have SRT protocol support.");
    console.error("[Preflight] Rebuild FFmpeg with --enable-libsrt or install a package that includes it.");
    process.exit(1);
  }

  console.log("[Preflight] SRT protocol support confirmed");

  // Check NDI device support (optional, non-fatal)
  let devicesOutput: string;
  try {
    const proc = Bun.spawn([config.ffmpegPath, "-devices"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    devicesOutput = await new Response(proc.stdout).text();
    const stderrOut = await new Response(proc.stderr).text();
    devicesOutput += stderrOut;
    await proc.exited;
  } catch {
    devicesOutput = "";
  }

  const hasNdi = /libndi_newtek/i.test(devicesOutput);
  if (hasNdi) {
    console.log("[Preflight] NDI output support confirmed");
  } else {
    console.log("[Preflight] NDI output not available (FFmpeg built without libndi_newtek)");
  }
}

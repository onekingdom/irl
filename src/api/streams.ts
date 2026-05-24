import { Router, jsonResponse, parseBody } from "./router";
import {
  getAllStreams,
  getStreamById,
  getStreamWithOutputs,
  createStream,
  updateStream,
  deleteStream,
  getOutputsByStreamId,
  getOutputById,
  createOutput,
  updateOutput,
  deleteOutput,
} from "../db";
import { streamManager } from "../streams/manager";
import {
  generateStreamKey,
  validatePassphrase,
  allocateInputPort,
  allocateRelayPort,
} from "../auth";
import type {
  CreateStreamInput,
  UpdateStreamInput,
  CreateOutputInput,
  UpdateOutputInput,
} from "../streams/types";

export function registerStreamRoutes(router: Router): void {
  // ── Stream CRUD ──

  router.get("/api/streams", () => {
    const streams = getAllStreams();
    return jsonResponse(streams);
  });

  router.post("/api/streams", async (req) => {
    const body = await parseBody<CreateStreamInput>(req);

    if (!body.name || !body.passphrase) {
      return jsonResponse({ error: "name and passphrase are required" }, 400);
    }

    const passphraseCheck = validatePassphrase(body.passphrase);
    if (!passphraseCheck.valid) {
      return jsonResponse({ error: passphraseCheck.error }, 400);
    }

    const portResult = allocateInputPort(body.listenPort);
    if (portResult.error) {
      return jsonResponse({ error: portResult.error }, 400);
    }

    const streamKey = generateStreamKey();
    const stream = createStream(body, streamKey, portResult.port);

    return jsonResponse(stream, 201);
  });

  router.get("/api/streams/:id", (_req, params) => {
    const stream = getStreamWithOutputs(params.id);
    if (!stream) {
      return jsonResponse({ error: "Stream not found" }, 404);
    }
    return jsonResponse(stream);
  });

  router.put("/api/streams/:id", async (req, params) => {
    const body = await parseBody<UpdateStreamInput>(req);

    if (body.passphrase) {
      const passphraseCheck = validatePassphrase(body.passphrase);
      if (!passphraseCheck.valid) {
        return jsonResponse({ error: passphraseCheck.error }, 400);
      }
    }

    if (streamManager.isRunning(params.id)) {
      return jsonResponse({ error: "Cannot update a running stream. Stop it first." }, 409);
    }

    const stream = updateStream(params.id, body);
    if (!stream) {
      return jsonResponse({ error: "Stream not found" }, 404);
    }

    return jsonResponse(stream);
  });

  router.delete("/api/streams/:id", async (_req, params) => {
    if (streamManager.isRunning(params.id)) {
      await streamManager.stop(params.id);
    }

    const deleted = deleteStream(params.id);
    if (!deleted) {
      return jsonResponse({ error: "Stream not found" }, 404);
    }

    return jsonResponse({ success: true });
  });

  // ── Stream lifecycle ──

  router.post("/api/streams/:id/start", async (_req, params) => {
    const result = await streamManager.start(params.id);
    if (!result.success) {
      return jsonResponse({ error: result.error }, 400);
    }
    return jsonResponse({ success: true, message: "Stream listener started" });
  });

  router.post("/api/streams/:id/stop", async (_req, params) => {
    const result = await streamManager.stop(params.id);
    if (!result.success) {
      return jsonResponse({ error: result.error }, 400);
    }
    return jsonResponse({ success: true, message: "Stream stopped" });
  });

  // ── Output CRUD ──

  router.get("/api/streams/:id/outputs", (_req, params) => {
    const stream = getStreamById(params.id);
    if (!stream) {
      return jsonResponse({ error: "Stream not found" }, 404);
    }

    const outputs = getOutputsByStreamId(params.id);
    return jsonResponse(outputs);
  });

  router.post("/api/streams/:id/outputs", async (req, params) => {
    const stream = getStreamById(params.id);
    if (!stream) {
      return jsonResponse({ error: "Stream not found" }, 404);
    }

    const body = await parseBody<CreateOutputInput>(req);

    if (!body.name || !body.protocol || !body.mode) {
      return jsonResponse({ error: "name, protocol, and mode are required" }, 400);
    }

    if (!["srt", "rtmp", "ndi"].includes(body.protocol)) {
      return jsonResponse({ error: "protocol must be 'srt', 'rtmp', or 'ndi'" }, 400);
    }

    if (body.protocol === "ndi") {
      if (!body.ndiName) {
        return jsonResponse({ error: "ndiName is required for NDI outputs" }, 400);
      }
      body.mode = "relay";
    } else {
      if (!["relay", "push"].includes(body.mode)) {
        return jsonResponse({ error: "mode must be 'relay' or 'push'" }, 400);
      }
      if (body.mode === "push" && !body.url) {
        return jsonResponse({ error: "url is required for push mode" }, 400);
      }
    }

    let relayPort: number | undefined;
    if (body.mode === "relay" && body.protocol !== "ndi") {
      const portResult = allocateRelayPort(body.relayPort);
      if (portResult.error) {
        return jsonResponse({ error: portResult.error }, 400);
      }
      relayPort = portResult.port;
    }

    if (streamManager.isRunning(params.id)) {
      return jsonResponse({ error: "Cannot add outputs to a running stream. Stop it first." }, 409);
    }

    const output = createOutput(params.id, body, relayPort);
    return jsonResponse(output, 201);
  });

  router.put("/api/outputs/:id", async (req, params) => {
    const existing = getOutputById(params.id);
    if (!existing) {
      return jsonResponse({ error: "Output not found" }, 404);
    }

    if (streamManager.isRunning(existing.streamId)) {
      return jsonResponse({ error: "Cannot update outputs on a running stream. Stop it first." }, 409);
    }

    const body = await parseBody<UpdateOutputInput>(req);
    const output = updateOutput(params.id, body);
    if (!output) {
      return jsonResponse({ error: "Output not found" }, 404);
    }

    return jsonResponse(output);
  });

  router.delete("/api/outputs/:id", async (_req, params) => {
    const existing = getOutputById(params.id);
    if (!existing) {
      return jsonResponse({ error: "Output not found" }, 404);
    }

    if (streamManager.isRunning(existing.streamId)) {
      return jsonResponse({ error: "Cannot delete outputs on a running stream. Stop it first." }, 409);
    }

    const deleted = deleteOutput(params.id);
    if (!deleted) {
      return jsonResponse({ error: "Output not found" }, 404);
    }

    return jsonResponse({ success: true });
  });
}

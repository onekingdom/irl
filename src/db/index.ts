import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { nanoid } from "nanoid";
import { config } from "../config";
import { initializeDatabase } from "./schema";
import type {
  Stream,
  StreamOutput,
  CreateStreamInput,
  UpdateStreamInput,
  CreateOutputInput,
  UpdateOutputInput,
  StreamWithOutputs,
} from "../streams/types";

let db: Database;

export function getDb(): Database {
  if (!db) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    db = new Database(config.dbPath, { create: true });
    initializeDatabase(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}

// ── Stream row mapper ──

interface StreamRow {
  id: string;
  name: string;
  stream_key: string;
  passphrase: string;
  listen_port: number;
  latency_ms: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface OutputRow {
  id: string;
  stream_id: string;
  name: string;
  protocol: string;
  mode: string;
  url: string | null;
  relay_port: number | null;
  passphrase: string | null;
  ndi_name: string | null;
  enabled: number;
  codec_mode: string;
  created_at: string;
}

function mapStreamRow(row: StreamRow): Stream {
  return {
    id: row.id,
    name: row.name,
    streamKey: row.stream_key,
    passphrase: row.passphrase,
    listenPort: row.listen_port,
    latencyMs: row.latency_ms,
    status: row.status as Stream["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOutputRow(row: OutputRow): StreamOutput {
  return {
    id: row.id,
    streamId: row.stream_id,
    name: row.name,
    protocol: row.protocol as StreamOutput["protocol"],
    mode: row.mode as StreamOutput["mode"],
    url: row.url,
    relayPort: row.relay_port,
    passphrase: row.passphrase,
    ndiName: row.ndi_name,
    enabled: row.enabled === 1,
    codecMode: row.codec_mode as StreamOutput["codecMode"],
    createdAt: row.created_at,
  };
}

// ── Stream CRUD ──

export function getAllStreams(): Stream[] {
  const rows = getDb().query("SELECT * FROM streams ORDER BY created_at DESC").all() as StreamRow[];
  return rows.map(mapStreamRow);
}

export function getStreamById(id: string): Stream | null {
  const row = getDb().query("SELECT * FROM streams WHERE id = ?").get(id) as StreamRow | null;
  return row ? mapStreamRow(row) : null;
}

export function getStreamWithOutputs(id: string): StreamWithOutputs | null {
  const stream = getStreamById(id);
  if (!stream) return null;
  const outputs = getOutputsByStreamId(id);
  return { ...stream, outputs };
}

export function createStream(input: CreateStreamInput, streamKey: string, listenPort: number): Stream {
  const id = nanoid();
  const latencyMs = input.latencyMs ?? config.defaultSrtLatencyMs;

  getDb()
    .query(
      `INSERT INTO streams (id, name, stream_key, passphrase, listen_port, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.name, streamKey, input.passphrase, listenPort, latencyMs);

  return getStreamById(id)!;
}

export function updateStream(id: string, input: UpdateStreamInput): Stream | null {
  const existing = getStreamById(id);
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const passphrase = input.passphrase ?? existing.passphrase;
  const latencyMs = input.latencyMs ?? existing.latencyMs;

  getDb()
    .query(
      `UPDATE streams SET name = ?, passphrase = ?, latency_ms = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(name, passphrase, latencyMs, id);

  return getStreamById(id);
}

export function deleteStream(id: string): boolean {
  const result = getDb().query("DELETE FROM streams WHERE id = ?").run(id);
  return result.changes > 0;
}

export function updateStreamStatus(id: string, status: Stream["status"]): void {
  getDb()
    .query("UPDATE streams SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, id);
}

export function getUsedInputPorts(): number[] {
  const rows = getDb().query("SELECT listen_port FROM streams").all() as { listen_port: number }[];
  return rows.map((r) => r.listen_port);
}

// ── Output CRUD ──

export function getOutputsByStreamId(streamId: string): StreamOutput[] {
  const rows = getDb()
    .query("SELECT * FROM outputs WHERE stream_id = ? ORDER BY created_at")
    .all(streamId) as OutputRow[];
  return rows.map(mapOutputRow);
}

export function getOutputById(id: string): StreamOutput | null {
  const row = getDb().query("SELECT * FROM outputs WHERE id = ?").get(id) as OutputRow | null;
  return row ? mapOutputRow(row) : null;
}

export function getEnabledOutputsByStreamId(streamId: string): StreamOutput[] {
  const rows = getDb()
    .query("SELECT * FROM outputs WHERE stream_id = ? AND enabled = 1 ORDER BY created_at")
    .all(streamId) as OutputRow[];
  return rows.map(mapOutputRow);
}

export function createOutput(streamId: string, input: CreateOutputInput, relayPort?: number): StreamOutput {
  const id = nanoid();
  const enabled = input.enabled !== undefined ? (input.enabled ? 1 : 0) : 1;
  const codecMode = input.protocol === "ndi" ? "transcode" : (input.codecMode ?? "copy");
  const assignedRelayPort = input.mode === "relay" && input.protocol !== "ndi" ? (input.relayPort ?? relayPort ?? null) : null;
  const url = input.mode === "push" ? (input.url ?? null) : null;
  const ndiName = input.protocol === "ndi" ? (input.ndiName ?? null) : null;

  getDb()
    .query(
      `INSERT INTO outputs (id, stream_id, name, protocol, mode, url, relay_port, passphrase, ndi_name, enabled, codec_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, streamId, input.name, input.protocol, input.mode, url, assignedRelayPort, input.passphrase ?? null, ndiName, enabled, codecMode);

  return getOutputById(id)!;
}

export function updateOutput(id: string, input: UpdateOutputInput): StreamOutput | null {
  const existing = getOutputById(id);
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const url = input.url ?? existing.url;
  const passphrase = input.passphrase !== undefined ? input.passphrase : existing.passphrase;
  const ndiName = input.ndiName !== undefined ? input.ndiName : existing.ndiName;
  const enabled = input.enabled !== undefined ? (input.enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
  const codecMode = input.codecMode ?? existing.codecMode;

  getDb()
    .query(
      `UPDATE outputs SET name = ?, url = ?, passphrase = ?, ndi_name = ?, enabled = ?, codec_mode = ?
       WHERE id = ?`
    )
    .run(name, url, passphrase, ndiName, enabled, codecMode, id);

  return getOutputById(id);
}

export function deleteOutput(id: string): boolean {
  const result = getDb().query("DELETE FROM outputs WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getUsedRelayPorts(): number[] {
  const rows = getDb()
    .query("SELECT relay_port FROM outputs WHERE relay_port IS NOT NULL")
    .all() as { relay_port: number }[];
  return rows.map((r) => r.relay_port);
}

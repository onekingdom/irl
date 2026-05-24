import { Database } from "bun:sqlite";

const PRAGMA_WAL = "PRAGMA journal_mode = WAL";
const PRAGMA_FK = "PRAGMA foreign_keys = ON";

const CREATE_STREAMS_TABLE = `
  CREATE TABLE IF NOT EXISTS streams (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    stream_key  TEXT NOT NULL UNIQUE,
    passphrase  TEXT NOT NULL,
    listen_port INTEGER NOT NULL UNIQUE,
    latency_ms  INTEGER NOT NULL DEFAULT 2000,
    status      TEXT NOT NULL DEFAULT 'inactive',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

const CREATE_OUTPUTS_TABLE = `
  CREATE TABLE IF NOT EXISTS outputs (
    id          TEXT PRIMARY KEY,
    stream_id   TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    protocol    TEXT NOT NULL,
    mode        TEXT NOT NULL,
    url         TEXT,
    relay_port  INTEGER,
    passphrase  TEXT,
    ndi_name    TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    codec_mode  TEXT NOT NULL DEFAULT 'copy',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

const MIGRATE_ADD_NDI_NAME = `
  ALTER TABLE outputs ADD COLUMN ndi_name TEXT
`;

export function initializeDatabase(db: Database): void {
  db.run(PRAGMA_WAL);
  db.run(PRAGMA_FK);
  db.run(CREATE_STREAMS_TABLE);
  db.run(CREATE_OUTPUTS_TABLE);

  // Migration: add ndi_name column if missing (existing DBs before NDI support)
  try {
    db.run(MIGRATE_ADD_NDI_NAME);
  } catch {
    // Column already exists
  }
}

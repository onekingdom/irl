# IRL Media Server

Multi-tenant FFmpeg relay server for IRL streaming built with Bun.

Accepts incoming SRT streams from IRL phone encoders (Larix, IRL Pro, Belabox), authenticates via stream key + passphrase, and relays them as pullable SRT endpoints for OBS to consume as media sources.

## Requirements

- [Bun](https://bun.sh) v1.1+
- FFmpeg with SRT support (`ffmpeg -protocols | grep srt`)

## Setup

```bash
bun install
cp .env.example .env
bun run dev
```

## Usage

### 1. Create a stream

```bash
curl -X POST http://localhost:8080/api/streams \
  -H "Content-Type: application/json" \
  -d '{"name": "Streamer A", "passphrase": "my-secret-pass-10char"}'
```

### 2. Add a relay output (pullable by OBS)

```bash
curl -X POST http://localhost:8080/api/streams/{id}/outputs \
  -H "Content-Type: application/json" \
  -d '{"name": "OBS Relay", "protocol": "srt", "mode": "relay"}'
```

### 3. Start the stream listener

```bash
curl -X POST http://localhost:8080/api/streams/{id}/start
```

### 4. Connect your encoder

Point your IRL encoder (Larix/IRL Pro) to:
```
srt://your-server:{input_port}?passphrase={passphrase}
```

### 5. Connect OBS

Add a Media Source in OBS with:
```
srt://your-server:{relay_port}?passphrase={optional_pass}
```

### 6. Monitor health

```bash
curl http://localhost:8080/api/streams/{id}/metrics
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/streams | List all streams |
| POST | /api/streams | Create stream |
| GET | /api/streams/:id | Get stream |
| PUT | /api/streams/:id | Update stream |
| DELETE | /api/streams/:id | Delete stream |
| POST | /api/streams/:id/start | Start listener |
| POST | /api/streams/:id/stop | Stop listener |
| GET | /api/streams/:id/outputs | List outputs |
| POST | /api/streams/:id/outputs | Add output |
| PUT | /api/outputs/:id | Update output |
| DELETE | /api/outputs/:id | Remove output |
| GET | /api/streams/:id/metrics | Stream metrics |
| GET | /api/metrics | All metrics |
| GET | /api/health | Health check |

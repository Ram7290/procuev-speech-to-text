# Speech to Text — Real-time Multilingual Transcription

A web app where you speak (Hindi, English, or a **mix of both**) and the system transcribes it in real time. Every finalized sentence is stored in PostgreSQL, and a dashboard gives full CRUD over your transcription history.

> 🚀 **Live demo:** _[add deployed URL here]_
> 🐙 **Note:** tested with code-mixed Hindi–English speech ("मुझे यह project पसंद है") — Hindi is transcribed in Devanagari, English words stay in Latin script.

## Features

- 🎙 **Real-time transcription** — mic audio streams over a WebSocket; partial text shows while you speak, finalized sentences appear the moment you pause
- 🌐 **Multilingual / code-mixed** — automatic language detection per sentence, no language to pick
- 💾 **Persistence** — every sentence saved to PostgreSQL automatically
- 📊 **Dashboard** — search, inline-edit, delete, and manually add transcriptions (full CRUD)
- 🔊 **Text-to-speech playback** — read any transcription aloud (Hindi voice auto-selected for Devanagari text)
- 🔌 **Pluggable STT engine** — one env var switches between:
  - `STT_PROVIDER=gemini` — Gemini Live API (streaming, great accuracy, free tier)
  - `STT_PROVIDER=local` — self-hosted [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (fully open source, no API, no keys)

## Architecture

```
┌───────────── Browser (React + Vite) ─────────────┐
│  Live page: mic → AudioWorklet → 16 kHz PCM16    │
│  ──WebSocket──▶  ◀── partial / final events ──   │
│                                                  │
│  History page: REST CRUD ◀─ /api/transcripts     │
└──────────────────────────────────────────────────┘
                     │
                     ▼
┌───────────── Server (Node + Express) ────────────┐
│  /ws   → per-connection STT engine               │
│          ├─ gemini: Gemini Live API session      │
│          └─ local:  own VAD → whisper.cpp CLI    │
│  final text → Sequelize → PostgreSQL             │
└──────────────────────────────────────────────────┘
```

**Tech stack:** React 18 · Vite · Node.js · Express · `ws` · Sequelize · PostgreSQL · Gemini Live API / whisper.cpp

## Quick start (local)

Prerequisites: Node ≥ 20, Docker.

```bash
# 1. PostgreSQL
docker compose up -d postgres          # listens on host port 5433

# 2. Server
cd server
cp .env.example .env                   # add your free GEMINI_API_KEY (aistudio.google.com)
npm install
npm run dev                            # → http://localhost:8080

# 3. Client (second terminal)
cd client
npm install
npm run dev                            # → http://localhost:5173
```

Open **http://localhost:5173**, allow the microphone, click 🎤 and speak.

To test in production mode locally: `npm run build` in `client/`, then `SERVE_CLIENT=1 npm start` in `server/` — one server on `:8080` serves everything.

### Using the self-hosted engine (no API at all)

```bash
powershell scripts/setup-whisper.ps1   # downloads model + builds whisper-cli (Windows)
# or: MODEL=small ./scripts/setup-whisper.sh   (Linux/macOS)
# requires CMake + a C/C++ toolchain
```

Then in `server/.env` set `STT_PROVIDER=local`, `WHISPER_BIN=bin/whisper-cli.exe`, `WHISPER_MODEL=models/ggml-small.bin` (adjust per OS) and restart. Runs on CPU — `small` locally, `base` on low-memory servers.

## API

### REST — `/api/transcripts`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/transcripts?q=text` | List (newest first, optional search) |
| `POST` | `/api/transcripts` | Create — `{ "text": "..." }` |
| `PATCH` | `/api/transcripts/:id` | Update — `{ "text": "..." }` |
| `DELETE` | `/api/transcripts/:id` | Delete |
| `GET` | `/api/health` | DB + provider check |

### WebSocket — `/ws` (real-time channel)

- **In:** binary messages — 16 kHz mono PCM16 chunks
- **Out (JSON events):**

| Event | Meaning |
|---|---|
| `ready` | connected; includes the active provider |
| `partial` | in-progress transcription while still speaking |
| `final` | sentence ended, transcribed **and saved** (`transcript` = the new DB row) |
| `status` | `listening` / `transcribing` (drives the UI indicator) |
| `error` | configuration or runtime failure |

### Database

```sql
CREATE TABLE transcripts (
    id          UUID PRIMARY KEY,
    text        TEXT NOT NULL,
    language    TEXT,                         -- detected language
    duration_ms INTEGER,                      -- audio length
    source      TEXT NOT NULL DEFAULT 'live', -- 'live' | 'manual'
    created_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ
);
```

Defined as a Sequelize model; `sequelize.sync()` creates it on boot.

## Deployment (Render + Neon)

1. Create a free Postgres on [Neon](https://neon.tech) → copy the connection string.
2. Push this repo to GitHub → on [Render](https://render.com), **New → Blueprint** (uses `render.yaml`) or New Web Service → Docker.
3. Set env vars: `DATABASE_URL` (Neon), `GEMINI_API_KEY`, `STT_PROVIDER=gemini`.
4. Render builds the Docker image (client build + server), health check `/api/health`.

> Render's free tier sleeps after ~15 min idle — the first request after a pause takes ~30–60 s to wake. Hit the URL before a demo/review.

## How it works (design decisions)

- **Why WebSockets, not uploads:** transcription must begin before you stop speaking; a continuous byte stream over one socket keeps latency low.
- **Why 16 kHz PCM16:** the canonical audio format for both Gemini Live and whisper.cpp — the browser downsamples once, so the server does zero audio processing.
- **Voice-activity detection:** the `gemini` provider's Live API detects end-of-turn itself (we save on `turnComplete`). The `local` provider ships its own RMS-based VAD ([`src/vad.js`](server/src/vad.js)): segments are cut after ~0.7 s of silence, capped at 15 s.
- **Serialization:** transcription jobs (a spawned process per segment) run through a small promise queue — the CPU is never oversubscribed even while you keep talking.
- **Trade-offs:** whisper.cpp is file-based, so local-mode latency after a pause is ~1–2 s on CPU (partials every 2 s keep the screen feeling live). Gemini mode streams continuously and is near-instant.

## Project structure

See [PLAN.md](PLAN.md) for the full structure, schema, and phased implementation plan (Phase 1 = Gemini provider, Phase 2 = whisper.cpp provider).

## Environment variables (server)

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP/WebSocket port |
| `DATABASE_URL` | local docker URL | Postgres connection string |
| `STT_PROVIDER` | `gemini` | `gemini` \| `local` |
| `GEMINI_API_KEY` | — | required for `gemini` provider |
| `GEMINI_MODEL` | `gemini-3.5-transcribe-live` | Live API model id (run `GET /v1beta/models?key=…` to see all models your key can use, incl. newer ones) |
| `WHISPER_BIN` / `WHISPER_MODEL` | — | binary + model for `local` provider |
| `VAD_RMS_THRESHOLD` | `500` | local-provider silence threshold (mic-dependent) |
| `SERVE_CLIENT` | — | `1` → serve the built React app from Express |

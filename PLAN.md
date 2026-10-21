# Procuev Assignment — Implementation Plan

**Project:** Real-time Speech-to-Text web app (multilingual, e.g. Hindi + English mixed speech) with a transcription history dashboard (CRUD) backed by a relational database.

**My stack:** React (Vite) · Node.js + Express · Sequelize (ORM) · PostgreSQL

---

## 1. What the assignment is actually testing

| Requirement in the assignment | What it translates to technically |
|---|---|
| "Speak in real-time, system transcribes in real-time" | Streaming microphone audio from the browser to the server over a **WebSocket**, transcribing continuously (not one-shot file upload) |
| "Multilingual — mixture of Hindi & English" | An ASR model that **auto-detects language per segment** and handles code-switching → Whisper is the best open-source fit |
| "Self-deployed open source service" for STT | **whisper.cpp** compiled/run locally (no API key, no cost, runs on CPU) |
| "Use database to store transcription" | **PostgreSQL** table per transcription segment |
| "History visible in dashboard with CRUD operations" | REST API (list / create / update / delete) + React history page |
| Deliverables | Public **GitHub repo** + **deployed link** (Render free tier + Neon Postgres) |

---

## 2. Final architecture

```
┌───────────────────────────── BROWSER (React + Vite) ─────────────────────────────┐
│                                                                                  │
│   Live page:                          History page (dashboard):                  │
│   • Mic capture (getUserMedia         • Table of all transcriptions              │
│     + AudioWorklet)                   • Search, Edit (inline), Delete            │
│   • Downsample to 16 kHz mono         • Manual "add note" (Create)               │
│     16-bit PCM                        • TTS playback (browser speechSynthesis)   │
│   • Send PCM chunks ──────┐                                                      │
│   • Show partial + final ◀┼── WebSocket ──────┐                                  │
└───────────────────────────┼───────────────────┼──────────────────────────────────┘
                            │                   │
                            ▼                   ▼
┌────────────────────────────── SERVER (Node + Express) ───────────────────────────┐
│                                                                                  │
│   /ws  (WebSocket, library: ws)            /api/transcripts  (REST CRUD)         │
│        │                                         │                               │
│        │  receive PCM chunks (Int16)             │ Sequelize (ORM)               │
│        ▼                                         ▼                               │
│   STT ENGINE (pluggable, one env var)         PostgreSQL                        │
│   ├── "gemini" (Phase 1): stream chunks       (Neon free tier in cloud,         │
│   │        to Gemini Live API, receive         local via Docker in dev)         │
│   │        streaming transcription back                                          │
│   └── "local"  (Phase 2): own VAD cuts segments                                  │
│            on silence → spawn whisper.cpp per segment (self-hosted)              │
│        │                                                                         │
│        └─► final text ──► INSERT INTO transcripts ──► emit 'final' to browser    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### The STT engine is pluggable — Phase 1: Gemini Live API → Phase 2: whisper.cpp

Both providers sit behind the same small interface (`pushChunk(pcm)` in → *partial* + *final* text out). Everything else — WebSocket, database, CRUD, dashboard — is identical. Switching is one env var: `STT_PROVIDER=gemini|local`.

**Phase 1 — Gemini Live API (build & ship this first):**
- Fastest path to a working, deployed demo with good Hinglish accuracy — no model to build or host.
- Flow: Express opens one Gemini Live session per browser connection, forwards the 16 kHz PCM chunks, and receives **streaming transcription events** back. Gemini does its own voice-activity detection; when it signals *turn complete* (sentence ended), we save the accumulated text to Postgres and emit `final`.
- Needs a free `GEMINI_API_KEY` (Google AI Studio) in the server `.env` — the key stays server-side, never in the browser.
- Trade-off: it *is* a third-party API. The assignment only says it *prefers* self-hosted — it doesn't forbid APIs — and we address that in Phase 2.

**Phase 2 — whisper.cpp (self-hosted open source, added right after):**
- Fully satisfies the assignment's *preferred* option: runs on our own machine/server, free, no API key.
- Whisper is multilingual and handles **Hindi–English code-switching** well (Hindi usually comes out in Devanagari, English words stay in Latin script — expected behavior).
- Node can't run Whisper *in-process*, so Express **spawns the `whisper-cli` binary** per audio segment (our own VAD cuts the segments). Standard pattern, still one self-hosted service.
- Having both, switchable by env var, is itself a strong talking point — it shows clean provider abstraction.

---

## 3. How the real-time part works (the core idea)

1. **Browser mic capture** — `getUserMedia()` gets the mic; an **AudioWorklet** processor receives raw float samples (~every 85 ms).
2. **Downsample + convert** — from 48 kHz float to **16 kHz mono 16-bit PCM** (the format Whisper expects). Small chunks are sent over the WebSocket.
3. **Server VAD (Voice Activity Detection)** — for each chunk compute loudness (RMS). Logic:
   - loud chunk → we are *speaking* → append to the current segment buffer
   - quiet for **700 ms** in a row → the sentence probably ended → **finalize the segment**
   - safety cap: force-finalize any segment longer than **15 s**
4. **Transcribe** — write the segment as a temporary `.wav`, spawn `whisper-cli -m model.bin -f segment.wav -nt` (language = **auto-detect**, so mixed Hindi/English just works), read back the text.
5. **Persist + broadcast** — `INSERT` into PostgreSQL, then send a JSON event back over the WebSocket so the browser appends the finalized sentence immediately.
6. **Partials** — while a segment is still ongoing, every ~2 s the server transcribes the in-progress buffer and sends a *partial* result, so the screen feels live instead of waiting for sentence end.

> **In Gemini mode**, steps 3–4 are handled by Gemini itself: we forward raw chunks, it streams transcription text as we speak (our `partial`), and its *turn complete* signal triggers the save + `final`. The browser flow is identical in both modes.

---

## 4. Folder structure

```
Procuev/
├── PLAN.md                        ← this file
├── README.md                      ← the deliverable README (architecture, setup, demo GIF)
├── docker-compose.yml             ← local PostgreSQL for development
├── Dockerfile                     ← production image (client + server + whisper.cpp)
├── render.yaml                    ← Render deploy blueprint
├── scripts/
│   └── setup-whisper.ps1/.sh      ← downloads whisper.cpp binary + ggml model
├── server/                        ← Node + Express
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js               ← express app + http server + static client in prod
│       ├── db.js                  ← Sequelize instance + Postgres connection
│       ├── models/
│       │   └── transcript.js      ← Transcript model (defines the table, synced on boot)
│       ├── ws.js                  ← WebSocket sessions (audio in → events out)
│       ├── vad.js                 ← silence-based speech segmenter
│       ├── stt/
│       │   ├── index.js           ← provider switch (local | groq) + job queue
│       │   ├── whisper-local.js   ← spawn whisper.cpp on a temp .wav
│       │   ├── groq.js            ← fallback: hosted Whisper API
│       │   └── wav.js             ← PCM → WAV wrapper
│       └── routes/
│           └── transcripts.js     ← CRUD endpoints
└── client/                        ← React + Vite
    ├── package.json
    ├── vite.config.js             ← dev proxy: /api and /ws → Express :8080
    ├── public/
    │   └── recorder-worklet.js    ← AudioWorklet mic processor
    └── src/
        ├── main.jsx / App.jsx / styles.css
        ├── lib/
        │   ├── recorder.js        ← mic → 16 kHz PCM16 chunks
        │   └── api.js             ← REST client + WebSocket helper
        └── pages/
            ├── Live.jsx           ← live transcription page
            └── History.jsx        ← dashboard with CRUD
```

---

## 5. Database schema (PostgreSQL)

```sql
CREATE TABLE IF NOT EXISTS transcripts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text        TEXT NOT NULL,
    language    TEXT,                        -- detected language, e.g. 'hi' / 'en' (nullable)
    duration_ms INTEGER,                     -- length of the audio segment
    source      TEXT NOT NULL DEFAULT 'live',-- 'live' | 'manual'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- One row = one finalized sentence/segment (or a manually created note).
- `updated_at` changes on Edit; `created_at` sorts the history list.
- Defined as a Sequelize model (`Transcript`, in `server/src/models/transcript.js`); `sequelize.sync()` creates the table on boot — zero manual migration steps. Queries stay simple: `Transcript.findAll()` / `.create()` / `.update()` / `.destroy()`.

---

## 6. API design

### REST — `/api/transcripts` (the CRUD dashboard)

| Method | Path | Body | Purpose |
|---|---|---|---|
| `GET` | `/api/transcripts?q=` | — | **Read** list (newest first, optional text search) |
| `POST` | `/api/transcripts` | `{ text }` | **Create** (manual entry) |
| `PATCH` | `/api/transcripts/:id` | `{ text }` | **Update** (fix a transcription) |
| `DELETE` | `/api/transcripts/:id` | — | **Delete** |
| `GET` | `/api/health` | — | DB connectivity check (also Render health check) |

### WebSocket — `/ws` (the real-time channel)

**Client → server:** raw binary messages = 16 kHz mono PCM16 chunks (~85 ms each).
**Server → client:** JSON text events:

| Event | Meaning |
|---|---|
| `{"type":"ready", "provider":"local"}` | connection accepted |
| `{"type":"partial", "text":"..."}` | in-progress guess while you're still speaking |
| `{"type":"final", "transcript":{...row...}}` | sentence finalized **and saved to DB** |
| `{"type":"status", "state":"listening\|transcribing"}` | drives the UI status indicator |
| `{"type":"error", "message":"..."}` | transcription failure notice |

---

## 7. Build order (each step is independently testable)

1. **Backend skeleton** — Express + Sequelize (Postgres connection, `Transcript` model synced on boot) + `/api/health`. ✅ test: `curl /api/health`
2. **REST CRUD** — all 4 transcript endpoints. ✅ test: curl create/list/edit/delete
3. **WebSocket audio plumbing** — client captures mic → 16 kHz PCM → WS; server receives chunks (no ASR yet). ✅ test: log chunk sizes
4. **VAD segmenter** — silence detection cuts speech segments on the server. ✅ test: log segment durations while talking/pausing
5. **Gemini Live provider (Phase 1)** — stream chunks to Gemini, receive streaming text, **save to Postgres** on turn end, emit `final`. ← *core assignment works end-to-end after this*
6. **whisper.cpp local provider (Phase 2)** — VAD segments + spawn `whisper-cli` per segment behind the same interface; flip `STT_PROVIDER=local` to use it.
7. **Live page UI** — mic button, status, partial (gray) + final sentences, auto-scroll, TTS play button (browser `speechSynthesis`, picks a Hindi voice when text is Devanagari).
8. **History dashboard** — table + search + inline edit + delete + manual add. ← *full CRUD done*
9. **Deploy with the Gemini provider** — GitHub push → Render (Docker) + Neon (free Postgres) → live URL. (No whisper build in the image yet — small and fast to deploy.)
10. **whisper.cpp in Docker** — extend the image to compile whisper.cpp + download a model for the `local` provider.
11. **README polish** — architecture diagram, setup steps, WS protocol table, 30-second demo GIF.

> The assignment explicitly says partial submissions are acceptable — after step 7 the assignment is *complete*; TTS and deploy polish are what push it above the bar.

---

## 8. Running it locally (dev setup)

```bash
# 1. Postgres (Docker)
docker compose up -d postgres

# 2. Server — Phase 1 (Gemini provider): just add your free key
cd server && cp .env.example .env && npm install && npm run dev   # :8080
#   in .env:  STT_PROVIDER=gemini   GEMINI_API_KEY=<from Google AI Studio — free>

#    Phase 2 (self-hosted whisper.cpp), one-time download (script provided):
#      powershell scripts/setup-whisper.ps1      ← run from repo root (Windows)
#      → server/bin/whisper-cli.exe + server/models/ggml-small.bin
#      then in .env:  STT_PROVIDER=local

# 4. Client (second terminal)
cd client && npm install && npm run dev                           # :5173
```

Open http://localhost:5173 → allow mic → speak Hinglish → sentence appears on pause → shows in History.

---

## 9. Deployment plan (the two deliverables)

| Deliverable | How |
|---|---|
| **GitHub repo** | `git init` → push to a new repo `procuev-speech-to-text` (public). `.gitignore` covers `.env`, models, binaries, node_modules. |
| **Deployed link** | **Render** free tier, single Docker service (client static files + Express in one container). **Postgres** = **Neon** free tier → set `DATABASE_URL` env var. Phase 1 deploys with `STT_PROVIDER=gemini` + `GEMINI_API_KEY`; Phase 2 adds whisper.cpp to the image and flips the provider. |

Deployment notes:
- Render free tier **sleeps** after ~15 min idle → first request after a while takes ~30–60 s; hit the URL before recording a demo.
- `README.md` will contain the live URL + architecture + local setup so a reviewer can run it in <5 minutes.

---

## 10. Known trade-offs (documented in README, not hidden)

- **Gemini mode** depends on a third-party service, its API key and free-tier quotas — fine for a demo, and exactly why the self-hosted whisper.cpp provider exists alongside it.
- **Local mode uses chunked VAD transcription**, not word-level streaming — whisper.cpp is file-based; ~1–2 s latency after sentence end on CPU is the realistic trade-off without a GPU. Partials every 2 s keep it feeling live.
- Free-tier CPU is weak → local mode on the deployed demo uses the `base` model (better than `tiny` for Hindi); locally you can run `small` for noticeably better accuracy via one env var.
- Hindi speech is transcribed in **Devanagari** with English words in Latin script — standard Whisper behavior for code-mixed speech.
- Microphone VAD threshold is env-tunable (`VAD_RMS_THRESHOLD`) since mic sensitivity varies.

---

## 11. Nice-to-haves if time remains

- Language badge per row (from Whisper's detected language).
- Search + filter by date on the dashboard.
- `silero-vad` ONNX instead of RMS threshold (more robust VAD).
- Demo GIF + short Loom-style video in the README.

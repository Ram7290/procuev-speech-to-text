# Deployment Guide — How This App Went Live

A step-by-step record of how this project was deployed, why each choice was made, and how to reproduce or debug it. Written so that anyone (including future-you in an interview) can understand the full path from local code to a public URL.

**The deployed stack in one sentence:** a single Docker container on Render's free tier that serves the React build, the Express API, and the WebSocket — all backed by a free Neon PostgreSQL database, auto-deployed on every push to GitHub.

---

## 1. The big picture

```
   YOU (browser)
      │  https://procuev-speech-to-text.onrender.com
      ▼
┌───────────────────────────────────────────────┐
│  RENDER (free tier, Docker)                   │
│  one container runs:                          │
│   • React build  →  static files (/)          │
│   • Express API  →  /api/transcripts (CRUD)   │
│   • WebSocket    →  /ws (live transcription)  │
│   • health check →  /api/health               │
└──────────────────┬────────────────────────────┘
                   │ DATABASE_URL (TLS)
                   ▼
┌───────────────────────────────────────────────┐
│  NEON (free managed PostgreSQL)               │
│  table: transcripts (created by sequelize)    │
└───────────────────────────────────────────────┘
                   ▲
                   │ git push (auto-deploy)
┌───────────────────────────────────────────────┐
│  GITHUB  github.com/Ram7290/procuev-speech-to-text
│  source of truth; Render watches this repo    │
└───────────────────────────────────────────────┘
```

**Three services, each free:**

| Service | Role | Why this one |
|---|---|---|
| **GitHub** | source control + trigger for deploys | required deliverable; Render deploys straight from it |
| **Neon** | managed PostgreSQL | free tier is real Postgres (not a demo DB), TLS built in, survives restarts |
| **Render** | runs the container | free tier supports **Docker + WebSockets + health checks** — many free hosts (e.g. Vercel) do not do WebSockets, which rules them out for real-time audio |

---

## 2. What actually got deployed (the container's contents)

The whole app ships as **one Docker image** built from the repo's [`Dockerfile`](Dockerfile). Two stages:

**Stage 1 — build the client**

```dockerfile
FROM node:20-bookworm-slim AS client
COPY client/package*.json ./
RUN npm ci                    # reproducible install from package-lock.json
COPY client/ ./
RUN npm run build             # vite build → static files in client/dist
```

**Stage 2 — slim runtime image**

```dockerfile
FROM node:20-bookworm-slim
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev      # prod deps only (no vite etc.)
COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist
ENV SERVE_CLIENT=1 STT_PROVIDER=gemini PORT=8080
CMD ["node", "src/index.js"]
```

Why this shape:

- **`npm ci --omit=dev`** — production installs only runtime dependencies; faster, smaller, safer image.
- **`SERVE_CLIENT=1`** — makes Express serve `client/dist` as static files and fall back to `index.html` (so React routing works on refresh). One service, one URL, no CORS issues, and the WebSocket connects to the same origin.
- **`PORT=8080`** — Render tells containers which port to listen on; we read `process.env.PORT` and expose 8080. Binding to the port Render expects is what makes the health check pass.
- The Gemini engine needs **no model files** in the image — the model lives on Google's servers, which is why this image is small (~250 MB) and deploys in minutes. (The self-hosted whisper.cpp engine is used locally and documented in the README; compiling it into the image is a possible future step for `STT_PROVIDER=local` in the cloud.)

---

## 3. Step 1 — GitHub

1. Created the repo at **github.com/new** → name `procuev-speech-to-text`, **Public**, *no* auto-generated README (an empty repo receives a push cleanly).
2. Locally (the project was already a git repo with a commit):

```bash
git remote add origin https://github.com/Ram7290/procuev-speech-to-text.git
git push -u origin main
```

3. **The credential bump we hit (worth remembering):** the first push failed with

```
remote: Permission to Ram7290/procuev-speech-to-text.git denied to sabeer-ccs.
```

Windows Credential Manager had a **saved login for a different GitHub account** (`sabeer-ccs`) on this machine. Git reuses the stored credential silently, so pushes go out as the wrong user. Fix: `Control Panel → Credential Manager → Windows Credentials → git:https://github.com → Remove` (or `cmdkey /delete:...`), then push again — a browser window opens, log in as the correct account, authorize, and the push succeeds. That login is remembered for future pushes.

Secrets check before pushing: `server/.env` (contains the Gemini key) is in `.gitignore` — verified with `git diff --cached --name-only | grep server/.env` → not staged. Only `.env.example` (placeholder values) is committed.

---

## 4. Step 2 — Neon (managed PostgreSQL)

1. Signed up at **neon.com** → **New project** → picked the nearest region.
2. Neon hands out a connection string immediately:

```
postgresql://neondb_owner:<password>@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
```

3. That string becomes the server's `DATABASE_URL`.

Why Neon instead of running Postgres ourselves:

- **Serverless-ish free tier** — the database exists even while the app sleeps; you pay nothing and manage nothing (no backups, no upgrades to think about).
- **TLS required** (`sslmode=require`) — our code handles this automatically: [`server/src/db.js`](server/src/db.js) detects that the host is not `localhost` and enables SSL with `rejectUnauthorized: false`.
- **Zero schema work** — on first boot the server runs `sequelize.sync()`, which creates the `transcripts` table by itself. The database was empty when the app first connected; no migration scripts were run by hand.

> Local development uses a **separate** Postgres: `docker compose up -d postgres` on host port **5433** (5432 was taken by a PostgreSQL service already installed on the dev machine). Same schema, same code, different `DATABASE_URL` — cloud data and local data never mix.

---

## 5. Step 3 — Render (the running app)

1. **render.com** → sign in **with GitHub** → New → **Web Service** → pick the repo.
2. Settings used:

| Setting | Value | Why |
|---|---|---|
| Language | **Docker** (auto-detected) | Render builds our `Dockerfile` |
| Root directory | *(empty)* | Dockerfile is at repo root; it builds client + server itself. Setting this would break the build. |
| Instance type | **Free** | 512 MB RAM, shared CPU — enough for the Gemini provider (heavy audio work happens on Google's side) |
| Health check path | `/api/health` | declared in [`render.yaml`](render.yaml); Render polls it and only marks the deploy "live" when the DB answers |

3. **Environment variables** (set in the dashboard, never in code):

| Key | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string |
| `GEMINI_API_KEY` | the Gemini key (aistudio.google.com) |
| `STT_PROVIDER` | `gemini` |

4. Clicked **Create Web Service**. What Render then does automatically:
   - clones the repo → `docker build` (both Dockerfile stages) → pushes the image to its registry
   - starts the container with our env vars, maps the public HTTPS URL to the container port
   - polls `/api/health` until it returns 200 → **"Your service is live 🎉"**

Result: `https://procuev-speech-to-text.onrender.com`

---

## 6. Verifying the deployment (what was actually run)

Straight after the "live" banner, from a local terminal:

```powershell
# 1. health (includes DB reachability + active provider)
GET https://procuev-speech-to-text.onrender.com/api/health
→ {"ok":true,"provider":"gemini"}

# 2. full CRUD round-trip against production data
POST /api/transcripts   {"text":"deploy verification…"}   → 201, row id returned
PATCH /api/transcripts/<id>  {"text":"edited on live deployment"} → 200
DELETE /api/transcripts/<id>                              → 204
```

Then a real browser test: opened the URL, allowed the mic, spoke a Hindi–English sentence, watched it appear and save, and confirmed it in the History tab. Only after all of that was the URL written into the README and pushed.

**Why HTTPS matters here:** browsers only allow microphone access (`getUserMedia`) on secure origins. Because Render terminates TLS for us, the live app works with the mic out of the box — the same is true for local dev because `localhost` is treated as a secure context.

---

## 7. Day-2 behavior you should know

- **Auto-deploy:** every `git push` to `main` triggers a fresh Docker build and deploy. This README commit itself deployed the app again. Rollbacks are one click in the Render dashboard (previous images are kept).
- **Free tier sleeps:** after ~15 minutes with no HTTP traffic, the container is stopped; the next request pays a **30–60 s cold start** while it boots (Docker start + DB connect + Gemini handshake). Demo rule: open the URL and wait for the first response before recording or presenting.
- **Logs:** Render dashboard → *Logs* tab shows the container's stdout — `[server] listening…`, DB retry messages, API errors. This is the first place to look when anything misbehaves.
- **Data persistence:** rows live in Neon, not in the container — deploys, restarts, and sleeps never lose data. (Conversely: don't store files on disk inside the container; it's ephemeral.)
- **Secrets:** rotate the Gemini key by editing the env var in the Render dashboard and restarting the service. The key never appears in the repo, logs, or the browser — all Gemini traffic originates from the server.

---

## 8. Troubleshooting table

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails at `npm ci` | lockfile out of sync with `package.json` | run `npm install` locally, commit the updated lockfile |
| Health check fails, logs show DB errors | wrong/missing `DATABASE_URL`, or Neon project paused | re-check the env var; open Neon and confirm the project is active |
| Page loads but mic doesn't start | page not on HTTPS (or browser denied permission) | use the Render URL (it is HTTPS); re-allow mic in site settings |
| "Listening…" but no transcription | bad/missing `GEMINI_API_KEY`, or model id retired | check for the red error bar; list available models with `GET /v1beta/models?key=…` (this exact failure — a retired model id — is how the project ended up on `gemini-3.5-transcribe-live`) |
| 503 / very slow first response | free-tier cold start | wait 30–60 s, retry |
| WebSocket connects then dies behind a proxy | proxy not forwarding upgrades | not an issue on Render (native support); relevant if self-hosting behind nginx (`proxy_set_header Upgrade/Connection`) |

---

## 9. How it would scale (interview talking points)

- **CPU-bound STT**: with the local whisper.cpp provider, transcription would be the bottleneck → separate the STT workers into their own containers with a job queue; the WebSocket process only streams.
- **Neon connection limits on free tier**: the app already uses a single Sequelize pool; at scale, front it with PgBouncer or use Neon's pooled connection string.
- **Storage/archival**: old rows → cold storage, with a retention policy and indexes on `created_at` for range queries.
- **Multi-region**: Render region nearest users + Neon region match to keep RTT low (matters for audio chunks).
- **Observability**: structured logs + request IDs, and a metrics endpoint before adding more instances.

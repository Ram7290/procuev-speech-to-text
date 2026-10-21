# --- Phase 1 image: client + server, STT via Gemini Live API ---
# (whisper.cpp for the "local" provider is added later / runs locally via scripts/setup-whisper.ps1)

# ---- stage 1: build the React client ----
FROM node:20-bookworm-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- stage 2: runtime ----
FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist

ENV SERVE_CLIENT=1
ENV STT_PROVIDER=gemini
ENV PORT=8080

WORKDIR /app/server
EXPOSE 8080
CMD ["node", "src/index.js"]

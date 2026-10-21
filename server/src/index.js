import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';

import { sequelize } from './db.js';
import transcriptsRouter from './routes/transcripts.js';
import { setupWs } from './ws.js';
import { provider } from './stt/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ ok: true, provider });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use('/api/transcripts', transcriptsRouter);

// In production (Docker/Render) the built React app is served by this same server.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (process.env.SERVE_CLIENT === '1') {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Keep last — catches errors from every route above.
app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ error: err.message || 'internal server error' });
});

const server = http.createServer(app);
setupWs(server);

try {
  // Retry for a few seconds — the database may still be starting up
  // (fresh docker container, cloud cold start).
  let connected = false;
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      await sequelize.authenticate();
      connected = true;
      break;
    } catch (err) {
      if (attempt === 1) console.error(`[server] waiting for PostgreSQL: ${err.message}`);
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  if (!connected) throw new Error('database unreachable after 15s');
  await sequelize.sync(); // creates the transcripts table if missing
  server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT} (STT provider: ${provider})`));
} catch (err) {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
}

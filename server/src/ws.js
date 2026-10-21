import { WebSocketServer } from 'ws';
import { createEngine } from './stt/index.js';
import { Transcript } from './models/transcript.js';

// One WebSocket connection per browser tab. Binary messages in = 16 kHz mono
// PCM16 mic chunks; JSON text messages out = transcription events.
export function setupWs(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let closed = false;
    const send = (obj) => {
      if (!closed && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };

    const engine = createEngine({
      onPartial: (text) => send({ type: 'partial', text }),
      onStatus: (state) => send({ type: 'status', state }),
      onError: (message) => send({ type: 'error', message }),
      onFinal: async ({ text, language, durationMs }) => {
        const trimmed = (text || '').trim();
        if (!trimmed) {
          send({ type: 'final', transcript: null }); // let the UI clear the partial
          return;
        }
        try {
          const row = await Transcript.create({
            text: trimmed,
            language: language ?? null,
            durationMs: durationMs ?? null,
            source: 'live',
          });
          send({ type: 'final', transcript: row.toJSON() });
        } catch (err) {
          console.error('[ws] failed to save transcript:', err.message);
          send({ type: 'error', message: 'transcribed, but saving to the database failed' });
        }
      },
    });

    send({ type: 'ready', provider: engine.name });

    ws.on('message', (data, isBinary) => {
      if (!isBinary || closed) return;
      // ws hands us a (possibly pooled) Buffer — copy so Int16Array reads align.
      const buf = Buffer.from(data);
      if (buf.byteLength < 2) return;
      const pcm = new Int16Array(buf.buffer, 0, buf.byteLength >> 1);
      engine.pushChunk(pcm);
    });

    ws.on('close', () => {
      closed = true;
      engine.close();
    });
    ws.on('error', () => {
      closed = true;
      engine.close();
    });
  });

  return wss;
}

import { GeminiEngine } from './gemini.js';
import { LocalEngine } from './local.js';

export const provider = (process.env.STT_PROVIDER || 'gemini').toLowerCase();

// Both engines expose the same tiny interface, so the rest of the app never
// changes when the STT backend changes:
//   pushChunk(int16)  — feed 16 kHz mono PCM16 audio
//   close()           — clean up when the browser disconnects
//   name              — provider id reported to the client on connect
// Handlers: onPartial(text), onFinal({text, language, durationMs}),
//           onError(message), onStatus(state)
export function createEngine(handlers) {
  if (provider === 'gemini') return new GeminiEngine(handlers);
  if (provider === 'local') return new LocalEngine(handlers);
  throw new Error(`Unknown STT_PROVIDER "${provider}" (expected "gemini" or "local")`);
}

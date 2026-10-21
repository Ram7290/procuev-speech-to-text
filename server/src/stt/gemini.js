import { GoogleGenAI } from '@google/genai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-transcribe-live';

// Phase 1 engine: streams mic chunks to a Gemini Live session and receives
// transcription events back. The transcribe-live model runs its own
// voice-activity detection and emits:
//   voiceActivity: { type: ACTIVITY_START | ACTIVITY_END }
//   serverContent.interimInputTranscription.text  — cumulative text while speaking
//   serverContent.inputTranscription.text         — FINAL text of the utterance
//   serverContent.generationComplete | turnComplete — utterance ended (model-dependent)
export class GeminiEngine {
  constructor(handlers) {
    this.handlers = handlers;
    this.turnBuffer = '';
    this.closed = false;
    this.session = null;
    this.open();
  }

  get name() {
    return 'gemini';
  }

  async open() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.handlers.onError?.('GEMINI_API_KEY is not set — add it to server/.env (free key: aistudio.google.com)');
      return;
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
      this.session = await ai.live.connect({
        model: MODEL,
        config: {
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => this.handlers.onStatus?.('listening'),
          onmessage: (msg) => this.onMessage(msg),
          onerror: (e) => this.handlers.onError?.(`Gemini error: ${e?.message || 'unknown'}`),
          onclose: (e) => {
            if (!this.closed) this.handlers.onError?.(`Gemini session closed: ${e?.reason || 'unexpectedly'}`);
          },
        },
      });
    } catch (err) {
      this.handlers.onError?.(`Gemini connection failed: ${err.message}`);
    }
  }

  onMessage(msg) {
    const sc = msg.serverContent || {};

    // New utterance begins (the transcribe-live model signals this).
    if (msg.voiceActivity?.type === 'ACTIVITY_START') {
      this.turnBuffer = '';
      this.handlers.onStatus?.('transcribing');
    }

    // Cumulative in-progress transcription.
    const interim = sc.interimInputTranscription?.text;
    if (interim != null) {
      this.turnBuffer = interim;
      this.handlers.onPartial?.(interim.trim());
    }

    // Final text of the current utterance → flush straight to the database.
    const final = sc.inputTranscription?.text;
    if (final != null) this.flush(final);

    // Fallback finalization signals (model-dependent which one arrives).
    if (sc.turnComplete || msg.voiceActivity?.type === 'ACTIVITY_END') this.flush();
  }

  /** Emit a finalized utterance and clear the buffer (deduplicates itself). */
  flush(text) {
    const value = (text ?? this.turnBuffer).trim();
    this.turnBuffer = '';
    if (value) this.handlers.onFinal?.({ text: value });
    this.handlers.onStatus?.('listening');
  }

  pushChunk(int16) {
    if (!this.session || this.closed) return;
    try {
      const b64 = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength).toString('base64');
      this.session.sendRealtimeInput({ media: { data: b64, mimeType: 'audio/pcm;rate=16000' } });
    } catch (err) {
      this.handlers.onError?.(`failed to send audio: ${err.message}`);
    }
  }

  close() {
    this.closed = true;
    try {
      this.session?.close();
    } catch {
      /* already closed */
    }
  }
}

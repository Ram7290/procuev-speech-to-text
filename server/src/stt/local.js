import { Segmenter } from '../vad.js';
import { transcribeLocal } from './whisper-local.js';

const PARTIAL_EVERY_MS = 2000; // how often to transcribe the in-progress segment
const MIN_PARTIAL_MS = 1200; // don't bother transcribing ultra-short buffers

// Phase 2 engine: fully self-hosted. Our own VAD (vad.js) cuts the audio
// stream into speech segments on silence; each segment is transcribed by the
// whisper.cpp binary (spawned per job, serialized through a queue so the CPU
// is never oversubscribed).
export class LocalEngine {
  constructor(handlers) {
    this.handlers = handlers;
    this.chain = Promise.resolve();
    this.pending = 0;
    this.lastPartialAt = 0;
    this.segmenter = new Segmenter({
      onFinalize: ({ pcm, durationMs }) => this.enqueue(() => this.finalize(pcm, durationMs)),
    });
    this.handlers.onStatus?.('listening');
  }

  get name() {
    return 'local';
  }

  enqueue(job) {
    this.pending += 1;
    const run = async () => {
      try {
        await job();
      } catch (err) {
        this.handlers.onError?.(err.message);
      } finally {
        this.pending -= 1;
        if (this.pending === 0) this.handlers.onStatus?.('listening');
      }
    };
    this.chain = this.chain.then(run);
  }

  async finalize(pcm, durationMs) {
    this.handlers.onStatus?.('transcribing');
    const { text, language } = await transcribeLocal(pcm);
    if (text) await this.handlers.onFinal?.({ text, language, durationMs });
  }

  pushChunk(pcm) {
    this.segmenter.push(pcm);

    // Periodic partial: only if the queue is idle and the buffer is long enough.
    const now = Date.now();
    if (
      this.segmenter.speaking &&
      this.segmenter.bufferedMs >= MIN_PARTIAL_MS &&
      now - this.lastPartialAt >= PARTIAL_EVERY_MS &&
      this.pending === 0
    ) {
      this.lastPartialAt = now;
      const pcmSnapshot = this.segmenter.takeSnapshot();
      this.enqueue(async () => {
        const { text } = await transcribeLocal(pcmSnapshot);
        if (text) this.handlers.onPartial?.(text);
      });
    }
  }

  close() {
    // The segmenter is chunk-driven (no timers), so nothing to clean up.
  }
}

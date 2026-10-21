// Silence-based Voice Activity Detection: buffers audio while the user is
// speaking and finalizes a segment once they pause (~700 ms) or the segment
// hits the max length. This is what turns a continuous audio stream into
// sentence-sized chunks for whisper.cpp (used by the "local" provider).
export class Segmenter {
  constructor(opts = {}) {
    this.sampleRate = opts.sampleRate || 16000;
    this.silenceMs = opts.silenceMs ?? 700;
    this.minSpeechMs = opts.minSpeechMs ?? 350;
    this.maxSegmentMs = opts.maxSegmentMs ?? 15000;
    this.threshold = opts.threshold ?? Number(process.env.VAD_RMS_THRESHOLD || 500);
    this.onFinalize = opts.onFinalize || (() => {});
    this.reset();
  }

  reset() {
    this.chunks = [];
    this.samples = 0;
    this.speechMs = 0;
    this.silenceRunMs = 0;
    this.speaking = false;
  }

  get bufferedMs() {
    return (this.samples / this.sampleRate) * 1000;
  }

  /** Feed one chunk of 16 kHz mono PCM16 audio. */
  push(int16) {
    const n = int16.length;
    if (!n) return;
    const chunkMs = (n / this.sampleRate) * 1000;

    let sum = 0;
    for (let i = 0; i < n; i++) sum += int16[i] * int16[i];
    const rms = Math.sqrt(sum / n);
    const voiced = rms > this.threshold;

    if (voiced) {
      this.speaking = true;
      this.silenceRunMs = 0;
      this.speechMs += chunkMs;
    } else if (this.speaking) {
      this.silenceRunMs += chunkMs;
    }

    if (!this.speaking) return;

    this.chunks.push(int16);
    this.samples += n;

    const pauseEnded = this.silenceRunMs >= this.silenceMs && this.speechMs >= this.minSpeechMs;
    const tooLong = this.bufferedMs >= this.maxSegmentMs;
    if (pauseEnded || tooLong) this.finalize();
  }

  /** Merge the in-progress segment into one Int16Array and reset state. */
  finalize() {
    const pcm = this.takeSnapshot();
    const durationMs = Math.round(this.bufferedMs);
    this.reset();
    if (pcm && durationMs >= this.minSpeechMs) {
      this.onFinalize({ pcm, durationMs });
    }
  }

  /** Copy of the in-progress segment (for periodic partial transcriptions). */
  takeSnapshot() {
    if (!this.samples) return null;
    const out = new Int16Array(this.samples);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

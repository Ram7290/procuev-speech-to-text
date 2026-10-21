// AudioWorklet processor: runs on the browser's audio thread, batches raw
// mic samples (~4096 frames ≈ 85 ms) and posts them to the main thread,
// where they are downsampled to 16 kHz PCM16 and sent over the WebSocket.
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffers = [];
    this.size = 0;
    this.target = 4096;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      this.buffers.push(channel.slice(0));
      this.size += channel.length;
      if (this.size >= this.target) {
        const merged = new Float32Array(this.size);
        let offset = 0;
        for (const chunk of this.buffers) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        this.port.postMessage(merged);
        this.buffers = [];
        this.size = 0;
      }
    }
    return true; // keep alive
  }
}

registerProcessor('recorder-worklet', RecorderProcessor);

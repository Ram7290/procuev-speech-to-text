// Microphone capture: getUserMedia → AudioWorklet (raw float frames) →
// downsample to 16 kHz → convert to 16-bit PCM16 → hand to caller.
// This is exactly the format both STT engines expect.
export async function startCapture({ onPcm16, onLevel }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule('/recorder-worklet.js');
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'recorder-worklet', { numberOfOutputs: 0 });

  node.port.onmessage = (e) => {
    const f32 = e.data; // Float32Array @ ctx.sampleRate (~85 ms of audio)
    onLevel?.(rms(f32));
    onPcm16?.(toPcm16(downsample(f32, ctx.sampleRate, 16000)));
  };

  source.connect(node);

  // Returned stop function: fully tears down the mic pipeline.
  return async () => {
    node.port.onmessage = null;
    try { node.disconnect(); } catch { /* ignore */ }
    try { source.disconnect(); } catch { /* ignore */ }
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
  };
}

function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function downsample(f32, from, to) {
  if (from === to) return f32;
  const ratio = from / to;
  const n = Math.floor(f32.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = f32[idx];
    const b = f32[Math.min(idx + 1, f32.length - 1)];
    out[i] = a + (b - a) * frac; // linear interpolation
  }
  return out;
}

function toPcm16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

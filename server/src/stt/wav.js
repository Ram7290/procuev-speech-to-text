// Wrap raw 16 kHz mono PCM16 samples in a minimal WAV container
// (whisper.cpp reads from files, so a valid RIFF header is all it needs).
export function pcmToWav(int16, sampleRate = 16000) {
  const dataLength = int16.length * 2;
  const wav = Buffer.alloc(44 + dataLength);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); // PCM chunk size
  wav.writeUInt16LE(1, 20); // format: PCM
  wav.writeUInt16LE(1, 22); // channels: mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28); // byte rate
  wav.writeUInt16LE(2, 32); // block align
  wav.writeUInt16LE(16, 34); // bits per sample
  wav.write('data', 36);
  wav.writeUInt32LE(dataLength, 40);
  Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength).copy(wav, 44);

  return wav;
}

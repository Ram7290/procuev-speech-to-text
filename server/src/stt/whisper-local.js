import { spawn } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pcmToWav } from './wav.js';

const resolveFromCwd = (p) => (p ? (path.isAbsolute(p) ? p : path.join(process.cwd(), p)) : p);

const binPath = () => resolveFromCwd(process.env.WHISPER_BIN || '');
const modelPath = () => resolveFromCwd(process.env.WHISPER_MODEL || '');

// Transcribe one 16 kHz mono PCM16 segment with the local whisper.cpp binary.
// Returns { text, language } — language is Whisper's auto-detection (default).
export async function transcribeLocal(int16, { language = 'auto' } = {}) {
  const bin = binPath();
  const model = modelPath();
  if (!bin || !model) {
    throw new Error('WHISPER_BIN / WHISPER_MODEL not set — run scripts/setup-whisper.ps1 first');
  }

  const wavPath = path.join(tmpdir(), `stt-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);
  await writeFile(wavPath, pcmToWav(int16));

  try {
    const { stdout, stderr } = await new Promise((resolve, reject) => {
      // -l auto: explicit auto-detect (also makes whisper-cli print the detected
      // language, which we parse below); -bs 1: greedy instead of 5-beam search
      // (decode is ~2× faster, near-real-time on CPU); -nt: plain text, no timestamps
      const child = spawn(bin, ['-m', model, '-f', wavPath, '-l', language, '-bs', '1', '-nt'], { windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => child.kill('SIGKILL'), 60000);
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('error', (e) => {
        clearTimeout(timeout);
        reject(new Error(e.code === 'ENOENT' ? `whisper binary not found at ${bin}` : `whisper spawn failed: ${e.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0 || stdout.trim()) resolve({ stdout, stderr });
        else reject(new Error(`whisper exited with code ${code}: ${stderr.slice(-300)}`));
      });
    });

    const langMatch = /detected language:\s*([A-Za-z]+)/.exec(stderr);
    const text = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      text: text || null,
      language: langMatch ? langMatch[1].slice(0, 2).toLowerCase() : null,
    };
  } finally {
    rm(wavPath, { force: true }).catch(() => {});
  }
}

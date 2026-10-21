import { Op } from 'sequelize';
import { Transcript } from '../models/transcript.js';

// Business/data logic for transcripts. Controllers and the WebSocket
// pipeline call these — they never touch the model directly.

// List newest first, optional text search.
export function listTranscripts(q) {
  const search = (q || '').toString().trim();
  return Transcript.findAll({
    where: search ? { text: { [Op.iLike]: `%${search}%` } } : undefined,
    order: [['createdAt', 'DESC']],
    limit: 500,
  });
}

// Manual entry from the dashboard (REST).
export function createTranscript(text) {
  return Transcript.create({ text: text.trim(), source: 'manual' });
}

// Fix a transcription. Returns the updated row, or null when not found.
export async function updateTranscript(id, text) {
  const row = await Transcript.findByPk(id);
  if (!row) return null;
  await row.update({ text: text.trim() });
  return row;
}

// Returns the number of deleted rows (0 = not found).
export function deleteTranscript(id) {
  return Transcript.destroy({ where: { id } });
}

// Save a finalized sentence streamed over WebSocket. Throws on DB failure so
// the caller can fall back — a failed save should not silently drop the text.
export async function saveLiveTranscript({ text, language, durationMs }) {
  return Transcript.create({
    text: text.trim(),
    language: language ?? null,
    durationMs: durationMs ?? null,
    source: 'live',
  });
}

import {
  listTranscripts,
  createTranscript,
  updateTranscript,
  deleteTranscript,
} from '../services/transcript.service.js';

// HTTP handlers for /api/transcripts. They validate input and shape the
// response — all database work goes through the service layer.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const readText = (body, res) => {
  const text = (body?.text ?? '').toString().trim();
  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return null;
  }
  if (text.length > 10000) {
    res.status(400).json({ error: 'text too long' });
    return null;
  }
  return text;
};

// GET /api/transcripts?q=...
export async function index(req, res, next) {
  try {
    const rows = await listTranscripts(req.query.q);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// POST /api/transcripts
export async function store(req, res, next) {
  try {
    const text = readText(req.body, res);
    if (text === null) return;
    const row = await createTranscript(text);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/transcripts/:id
export async function update(req, res, next) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid id' });
    const text = readText(req.body, res);
    if (text === null) return;
    const row = await updateTranscript(id, text);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/transcripts/:id
export async function destroy(req, res, next) {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid id' });
    const deleted = await deleteTranscript(id);
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

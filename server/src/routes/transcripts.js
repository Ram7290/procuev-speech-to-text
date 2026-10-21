import { Router } from 'express';
import { Op } from 'sequelize';
import { Transcript } from '../models/transcript.js';

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// READ — list newest first, optional ?q= text search
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const rows = await Transcript.findAll({
      where: q ? { text: { [Op.iLike]: `%${q}%` } } : undefined,
      order: [['createdAt', 'DESC']],
      limit: 500,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// CREATE — manual entry from the dashboard
router.post('/', async (req, res, next) => {
  try {
    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'text is required' });
    if (text.length > 10000) return res.status(400).json({ error: 'text too long' });
    const row = await Transcript.create({ text, source: 'manual' });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

// UPDATE — fix a transcription
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid id' });
    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'text is required' });
    const row = await Transcript.findByPk(id);
    if (!row) return res.status(404).json({ error: 'not found' });
    await row.update({ text });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// DELETE
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'invalid id' });
    const deleted = await Transcript.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;

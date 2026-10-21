import { Router } from 'express';
import {
  index,
  store,
  update,
  destroy,
} from '../controllers/transcript.controller.js';

// Thin router: only maps HTTP paths to controller methods.
const router = Router();

router.get('/', index);
router.post('/', store);
router.patch('/:id', update);
router.delete('/:id', destroy);

export default router;

import { Router } from 'express';
import { LiveController } from '../controllers/live.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Routes publiques
router.get('/', LiveController.getActiveLives);
router.get('/:id', LiveController.getLive);
router.get('/:id/top-gifters', LiveController.getTopGifters);

// Routes protégées
router.post('/', authMiddleware, LiveController.createLive);
router.post('/:id/join', authMiddleware, LiveController.joinLive);
router.post('/:id/leave', authMiddleware, LiveController.leaveLive);
router.delete('/:id', authMiddleware, LiveController.endLive);
router.post('/:id/gift', authMiddleware, LiveController.sendGift);

export default router;

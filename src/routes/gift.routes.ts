import { Router } from 'express';
import { GiftController } from '../controllers/gift.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Routes publiques
router.get('/available', GiftController.getAvailableGifts);

// Routes protégées
router.post('/watch-ad', authMiddleware, GiftController.watchRewardedAd);
router.get('/balance', authMiddleware, GiftController.getBalance);
router.get('/sent', authMiddleware, GiftController.getSentHistory);
router.get('/received', authMiddleware, GiftController.getReceivedHistory);
router.get('/stats', authMiddleware, GiftController.getStats);

export default router;

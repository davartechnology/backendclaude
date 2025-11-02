import { Router } from 'express';
import { SetsController } from '../controllers/sets.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Routes protégées (auth requise)

// Stats utilisateur
router.get('/user/:userId/today', authMiddleware, SetsController.getUserDailyStats);
router.get('/user/:userId/history', authMiddleware, SetsController.getUserHistory);
router.get('/user/:userId/suspicious', authMiddleware, SetsController.checkSuspiciousActivity);
router.get('/distribution/history/:userId', authMiddleware, SetsController.getUserDistributions);

// Stats globales (Admin seulement - TODO: ajouter middleware admin)
router.get('/top', authMiddleware, SetsController.getTopUsers);
router.get('/global/stats', authMiddleware, SetsController.getGlobalStats);
router.get('/distribution/stats', authMiddleware, SetsController.getDistributionStats);

// Distribution (Admin seulement - TODO: ajouter middleware admin)
router.post('/distribution/trigger', authMiddleware, SetsController.triggerDistribution);
router.get('/distribution/job/status', authMiddleware, SetsController.getJobStatus);

export default router;
// src/routes/balance.routes.ts
import { Router } from 'express';
import { BalanceController } from '../controllers/balance.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Routes protégées (auth requise)
router.get('/', authMiddleware, BalanceController.getBalance);
router.get('/history', authMiddleware, BalanceController.getHistory);
router.get('/stats', authMiddleware, BalanceController.getStats);

export default router;
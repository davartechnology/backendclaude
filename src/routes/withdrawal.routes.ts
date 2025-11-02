// src/routes/withdrawal.routes.ts

import { Router } from 'express';
import { WithdrawalController } from '../controllers/withdrawal.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Routes publiques (info)
router.get('/methods', WithdrawalController.getMethods);

// Routes protégées (user)
router.post('/', authMiddleware, WithdrawalController.createWithdrawal);
router.get('/', authMiddleware, WithdrawalController.getUserWithdrawals);
router.get('/:id', authMiddleware, WithdrawalController.getWithdrawal);

// Routes admin (TODO: ajouter middleware admin)
router.get('/admin/pending', authMiddleware, WithdrawalController.getPendingWithdrawals);
router.post('/:id/approve', authMiddleware, WithdrawalController.approveWithdrawal);
router.post('/:id/reject', authMiddleware, WithdrawalController.rejectWithdrawal);
router.get('/admin/stats', authMiddleware, WithdrawalController.getStats);

export default router;
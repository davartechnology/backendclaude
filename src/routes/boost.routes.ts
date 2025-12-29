// src/routes/boost.routes.ts
import { Router } from 'express';
import { BoostController } from '../controllers/boost.controller';
import { authMiddleware } from '../middleware/auth';
import express from 'express';

const router = Router();

// Routes publiques
router.get('/packages', BoostController.getPackages);

// Webhook Stripe (doit être AVANT express.json() middleware)
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  BoostController.stripeWebhook
);

// Routes protégées
router.post('/create-payment-intent', authMiddleware, BoostController.createPaymentIntent);
router.post('/confirm', authMiddleware, BoostController.confirmBoost);
router.get('/campaigns', authMiddleware, BoostController.getMyCampaigns);
router.get('/campaigns/:id/analytics', authMiddleware, BoostController.getCampaignAnalytics);

// Routes admin
router.get('/admin/stats', authMiddleware, BoostController.getGlobalStats);

export default router;
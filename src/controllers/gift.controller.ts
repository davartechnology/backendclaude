// src/controllers/gift.controller.ts
// ============================================
import { Request, Response } from 'express';
import { GiftService } from '../services/gift.service';

export class GiftController {
  // POST /api/gifts/watch-ad - Créditer après rewarded ad
  static async watchRewardedAd(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const { adId } = req.body;

      if (!adId) {
        return res.status(400).json({
          error: 'Ad ID is required'
        });
      }

      const result = await GiftService.creditFreeGifts(userId, adId);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Watch ad error:', error);
      return res.status(500).json({
        error: 'Failed to credit gifts'
      });
    }
  }

  // GET /api/gifts/balance - Voir sa gift balance
  static async getBalance(req: Request, res: Response) {
    try {
      const userId = req.userId!;

      const balance = await GiftService.getGiftBalance(userId);

      return res.status(200).json(balance);
    } catch (error) {
      console.error('Get gift balance error:', error);
      return res.status(500).json({
        error: 'Failed to get balance'
      });
    }
  }

  // GET /api/gifts/sent - Historique envoyés
  static async getSentHistory(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const limit = parseInt(req.query.limit as string) || 50;

      const gifts = await GiftService.getSentGiftsHistory(userId, limit);

      return res.status(200).json({ gifts });
    } catch (error) {
      console.error('Get sent gifts error:', error);
      return res.status(500).json({
        error: 'Failed to get sent gifts'
      });
    }
  }

  // GET /api/gifts/received - Historique reçus
  static async getReceivedHistory(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const limit = parseInt(req.query.limit as string) || 50;

      const gifts = await GiftService.getReceivedGiftsHistory(userId, limit);

      return res.status(200).json({ gifts });
    } catch (error) {
      console.error('Get received gifts error:', error);
      return res.status(500).json({
        error: 'Failed to get received gifts'
      });
    }
  }

  // GET /api/gifts/stats - Stats
  static async getStats(req: Request, res: Response) {
    try {
      const userId = req.userId!;

      const stats = await GiftService.getGiftStats(userId);

      return res.status(200).json(stats);
    } catch (error) {
      console.error('Get gift stats error:', error);
      return res.status(500).json({
        error: 'Failed to get stats'
      });
    }
  }

  // GET /api/gifts/available - Liste des gifts disponibles
  static async getAvailableGifts(req: Request, res: Response) {
    try {
      const gifts = GiftService.getAvailableGifts();

      return res.status(200).json({ gifts });
    } catch (error) {
      console.error('Get available gifts error:', error);
      return res.status(500).json({
        error: 'Failed to get available gifts'
      });
    }
  }
}
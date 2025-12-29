// src/controllers/live.controller.ts
import { Request, Response } from 'express';
import { LiveService } from '../services/live.service';

export class LiveController {
  // POST /api/lives - Créer un live
  static async createLive(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const { title } = req.body;

      if (!title || title.trim().length === 0) {
        return res.status(400).json({
          error: 'Title is required'
        });
      }

      const result = await LiveService.createLiveStream(userId, title);

      return res.status(201).json({
        message: 'Live stream created',
        ...result
      });
    } catch (error) {
      console.error('Create live error:', error);
      return res.status(500).json({
        error: 'Failed to create live stream'
      });
    }
  }

  // POST /api/lives/:id/join - Rejoindre un live
  static async joinLive(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const result = await LiveService.joinLiveStream(id, userId);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Live stream not found') {
          return res.status(404).json({ error: 'Live stream not found' });
        }
        if (error.message === 'Live stream is not active') {
          return res.status(400).json({ error: 'Live stream is not active' });
        }
      }
      console.error('Join live error:', error);
      return res.status(500).json({
        error: 'Failed to join live stream'
      });
    }
  }

  // POST /api/lives/:id/leave - Quitter un live
  static async leaveLive(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const result = await LiveService.leaveLiveStream(id, userId);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Live stream not found') {
        return res.status(404).json({ error: 'Live stream not found' });
      }
      console.error('Leave live error:', error);
      return res.status(500).json({
        error: 'Failed to leave live stream'
      });
    }
  }

  // DELETE /api/lives/:id - Terminer un live
  static async endLive(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const result = await LiveService.endLiveStream(id, userId);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Live stream not found') {
          return res.status(404).json({ error: 'Live stream not found' });
        }
        if (error.message === 'Unauthorized') {
          return res.status(403).json({ error: 'Unauthorized' });
        }
      }
      console.error('End live error:', error);
      return res.status(500).json({
        error: 'Failed to end live stream'
      });
    }
  }

  // GET /api/lives - Liste des lives actifs
  static async getActiveLives(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await LiveService.getActiveLiveStreams(page, limit);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Get active lives error:', error);
      return res.status(500).json({
        error: 'Failed to get active lives'
      });
    }
  }

  // GET /api/lives/:id - Détails d'un live
  static async getLive(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const liveStream = await LiveService.getLiveStreamById(id);

      return res.status(200).json({ liveStream });
    } catch (error) {
      if (error instanceof Error && error.message === 'Live stream not found') {
        return res.status(404).json({ error: 'Live stream not found' });
      }
      console.error('Get live error:', error);
      return res.status(500).json({
        error: 'Failed to get live stream'
      });
    }
  }

  // POST /api/lives/:id/gift - Envoyer un gift
  static async sendGift(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const { giftType, useFreeBalance } = req.body;

      if (!giftType) {
        return res.status(400).json({
          error: 'Gift type is required'
        });
      }

      const result = await LiveService.sendGift(
        id,
        userId,
        giftType,
        useFreeBalance || false
      );

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('not active')) {
          return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('Insufficient')) {
          return res.status(400).json({ error: error.message });
        }
        if (error.message === 'Invalid gift type') {
          return res.status(400).json({ error: 'Invalid gift type' });
        }
      }
      console.error('Send gift error:', error);
      return res.status(500).json({
        error: 'Failed to send gift'
      });
    }
  }

  // GET /api/lives/:id/top-gifters - Top gifters
  static async getTopGifters(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      const topGifters = await LiveService.getTopGifters(id, limit);

      return res.status(200).json({ topGifters });
    } catch (error) {
      console.error('Get top gifters error:', error);
      return res.status(500).json({
        error: 'Failed to get top gifters'
      });
    }
  }
}

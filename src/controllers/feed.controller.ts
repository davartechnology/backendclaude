import { Request, Response } from 'express';
import { FeedService } from '../services/feed.service';

export class FeedController {
  // GET /api/feed/for-you - Feed "Pour Toi" personnalisé
  static async getForYouFeed(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await FeedService.getForYouFeed(userId, page, limit);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Get for you feed error:', error);
      return res.status(500).json({
        error: 'Failed to get feed'
      });
    }
  }

  // GET /api/feed/following - Feed des abonnements
  static async getFollowingFeed(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const limit = parseInt(req.query.limit as string) || 20;

      const videos = await FeedService.getFollowingFeed(userId, limit);

      return res.status(200).json({
        videos: videos.map(v => v.video)
      });
    } catch (error) {
      console.error('Get following feed error:', error);
      return res.status(500).json({
        error: 'Failed to get following feed'
      });
    }
  }

  // GET /api/feed/trending - Feed des vidéos populaires
  static async getTrendingFeed(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 20;

      const videos = await FeedService.getTrendingFeed(limit);

      return res.status(200).json({
        videos
      });
    } catch (error) {
      console.error('Get trending feed error:', error);
      return res.status(500).json({
        error: 'Failed to get trending feed'
      });
    }
  }

  // GET /api/feed/search - Recherche de vidéos
  static async searchVideos(req: Request, res: Response) {
    try {
      const query = req.query.q as string;

      if (!query || query.trim().length === 0) {
        return res.status(400).json({
          error: 'Search query is required'
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await FeedService.searchVideos(query, page, limit);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Search videos error:', error);
      return res.status(500).json({
        error: 'Failed to search videos'
      });
    }
  }
}
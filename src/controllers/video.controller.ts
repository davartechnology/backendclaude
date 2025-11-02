import { Request, Response } from 'express';
import { VideoService } from '../services/video.service';
import { SetsService } from '../services/sets.service';
import { prisma } from '../server';

export class VideoController {
  // POST /api/videos - Upload vidéo
  static async uploadVideo(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const { title, description, hashtags, soundId } = req.body;
      const videoFile = req.file;

      if (!videoFile) {
        return res.status(400).json({
          error: 'Video file is required'
        });
      }

      // Parse hashtags si c'est une string JSON
      let parsedHashtags;
      if (hashtags) {
        try {
          parsedHashtags = typeof hashtags === 'string' ? JSON.parse(hashtags) : hashtags;
        } catch (e) {
          parsedHashtags = [];
        }
      }

      const video = await VideoService.createVideo({
        userId,
        title,
        description,
        videoFile,
        hashtags: parsedHashtags,
        soundId
      });

      // ⭐ AJOUTER SETS : Publier vidéo = 2 sets
      await SetsService.addSets(userId, 'video_upload', 2, video.id);

      return res.status(201).json({
        message: 'Video uploaded successfully',
        video
      });
    } catch (error) {
      console.error('Upload video error:', error);
      return res.status(500).json({
        error: 'Failed to upload video'
      });
    }
  }

  // GET /api/videos/:id - Récupérer une vidéo
  static async getVideo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId; // Optionnel (peut être undefined)

      const video = await VideoService.getVideoById(id, userId);

      return res.status(200).json({ video });
    } catch (error) {
      if (error instanceof Error && error.message === 'Video not found') {
        return res.status(404).json({ error: 'Video not found' });
      }
      console.error('Get video error:', error);
      return res.status(500).json({
        error: 'Failed to get video'
      });
    }
  }

  // GET /api/videos/user/:userId - Vidéos d'un utilisateur
  static async getUserVideos(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await VideoService.getUserVideos(userId, page, limit);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Get user videos error:', error);
      return res.status(500).json({
        error: 'Failed to get user videos'
      });
    }
  }

  // DELETE /api/videos/:id - Supprimer une vidéo
  static async deleteVideo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const result = await VideoService.deleteVideo(id, userId);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Video not found') {
          return res.status(404).json({ error: 'Video not found' });
        }
        if (error.message === 'Unauthorized') {
          return res.status(403).json({ error: 'Unauthorized' });
        }
      }
      console.error('Delete video error:', error);
      return res.status(500).json({
        error: 'Failed to delete video'
      });
    }
  }

  // POST /api/videos/:id/view - Incrémenter vues
  static async incrementView(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId; // Optionnel

      await VideoService.incrementViews(id);

      // ⭐ AJOUTER SETS : Regarder vidéo = 0.5 sets (si user connecté et > 30s)
      if (userId) {
        const duration = parseInt(req.body.duration as string) || 0;
        if (duration >= 30) {
          await SetsService.addSets(userId, 'view', 0.5, id);
        }
      }

      return res.status(200).json({
        message: 'View counted'
      });
    } catch (error) {
      console.error('Increment view error:', error);
      return res.status(500).json({
        error: 'Failed to count view'
      });
    }
  }

  // POST /api/videos/:id/like - Liker une vidéo
  static async likeVideo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const result = await VideoService.likeVideo(id, userId);

      // ⭐ AJOUTER SETS : Like = 1 set pour celui qui like
      await SetsService.addSets(userId, 'like', 1, id);

      // ⭐ AJOUTER SETS : Recevoir like = 0.3 sets pour le créateur
      const video = await prisma.video.findUnique({ where: { id } });
      if (video && video.userId !== userId) {
        await SetsService.addSets(video.userId, 'receive_like', 0.3, id);
      }

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Already liked') {
        return res.status(409).json({ error: 'Already liked' });
      }
      console.error('Like video error:', error);
      return res.status(500).json({
        error: 'Failed to like video'
      });
    }
  }

  // DELETE /api/videos/:id/like - Unliker une vidéo
  static async unlikeVideo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const result = await VideoService.unlikeVideo(id, userId);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Not liked') {
        return res.status(404).json({ error: 'Not liked' });
      }
      console.error('Unlike video error:', error);
      return res.status(500).json({
        error: 'Failed to unlike video'
      });
    }
  }

  // POST /api/videos/:id/favorite - Ajouter aux favoris
  static async addToFavorites(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const result = await VideoService.addToFavorites(id, userId);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Already in favorites') {
        return res.status(409).json({ error: 'Already in favorites' });
      }
      console.error('Add to favorites error:', error);
      return res.status(500).json({
        error: 'Failed to add to favorites'
      });
    }
  }

  // DELETE /api/videos/:id/favorite - Retirer des favoris
  static async removeFromFavorites(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const result = await VideoService.removeFromFavorites(id, userId);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Not in favorites') {
        return res.status(404).json({ error: 'Not in favorites' });
      }
      console.error('Remove from favorites error:', error);
      return res.status(500).json({
        error: 'Failed to remove from favorites'
      });
    }
  }

  // GET /api/videos/favorites/me - Mes vidéos favorites
  static async getMyFavorites(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await VideoService.getUserFavorites(userId, page, limit);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Get favorites error:', error);
      return res.status(500).json({
        error: 'Failed to get favorites'
      });
    }
  }

  // POST /api/videos/:id/share - Compter un partage
  static async shareVideo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const result = await VideoService.incrementShares(id);

      // ⭐ AJOUTER SETS : Partage = 1 set
      await SetsService.addSets(userId, 'share', 1, id);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Share video error:', error);
      return res.status(500).json({
        error: 'Failed to count share'
      });
    }
  }

  // POST /api/videos/:id/comments - Ajouter un commentaire
  static async addComment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const { text, parentId } = req.body;

      if (!text || text.trim().length === 0) {
        return res.status(400).json({
          error: 'Comment text is required'
        });
      }

      if (text.length > 500) {
        return res.status(400).json({
          error: 'Comment too long (max 500 characters)'
        });
      }

      const comment = await VideoService.addComment(id, userId, text, parentId);

      // ⭐ AJOUTER SETS : Commentaire = 2 sets pour celui qui commente
      await SetsService.addSets(userId, 'comment', 2, id);

      // ⭐ AJOUTER SETS : Recevoir commentaire = 0.5 sets pour le créateur
      const video = await prisma.video.findUnique({ where: { id } });
      if (video && video.userId !== userId) {
        await SetsService.addSets(video.userId, 'receive_comment', 0.5, id);
      }

      return res.status(201).json({
        message: 'Comment added',
        comment
      });
    } catch (error) {
      console.error('Add comment error:', error);
      return res.status(500).json({
        error: 'Failed to add comment'
      });
    }
  }

  // GET /api/videos/:id/comments - Récupérer les commentaires
  static async getComments(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await VideoService.getComments(id, page, limit);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Get comments error:', error);
      return res.status(500).json({
        error: 'Failed to get comments'
      });
    }
  }
}
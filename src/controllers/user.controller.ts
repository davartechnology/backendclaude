// src/controllers/user.controller.ts
import { Request, Response } from 'express';
import { UserService } from '../services/user.service';

export class UserController {
  // GET /api/users/:id - Profil utilisateur
  static async getProfile(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const viewerId = req.userId; // Optionnel

      const profile = await UserService.getUserProfile(id, viewerId);

      return res.status(200).json({ user: profile });
    } catch (error) {
      if (error instanceof Error && error.message === 'User not found') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('Get profile error:', error);
      return res.status(500).json({
        error: 'Failed to get profile'
      });
    }
  }

  // POST /api/users/:id/follow - Follow un user
  static async followUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const followerId = req.userId!;

      const result = await UserService.followUser(followerId, id);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          return res.status(404).json({ error: 'User not found' });
        }
        if (error.message === 'Cannot follow yourself' || error.message === 'Already following') {
          return res.status(400).json({ error: error.message });
        }
      }
      console.error('Follow user error:', error);
      return res.status(500).json({
        error: 'Failed to follow user'
      });
    }
  }

  // DELETE /api/users/:id/follow - Unfollow un user
  static async unfollowUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const followerId = req.userId!;

      const result = await UserService.unfollowUser(followerId, id);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Not following') {
        return res.status(400).json({ error: 'Not following' });
      }
      console.error('Unfollow user error:', error);
      return res.status(500).json({
        error: 'Failed to unfollow user'
      });
    }
  }

  // GET /api/users/:id/followers - Liste des followers
  static async getFollowers(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await UserService.getFollowers(id, page, limit);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Get followers error:', error);
      return res.status(500).json({
        error: 'Failed to get followers'
      });
    }
  }

  // GET /api/users/:id/following - Liste des following
  static async getFollowing(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await UserService.getFollowing(id, page, limit);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Get following error:', error);
      return res.status(500).json({
        error: 'Failed to get following'
      });
    }
  }

  // PUT /api/users/me - Modifier son profil
  static async updateProfile(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const { username, bio, avatarUrl } = req.body;

      const updatedUser = await UserService.updateProfile(userId, {
        username,
        bio,
        avatarUrl
      });

      return res.status(200).json({
        message: 'Profile updated',
        user: updatedUser
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Username already taken') {
        return res.status(409).json({ error: 'Username already taken' });
      }
      console.error('Update profile error:', error);
      return res.status(500).json({
        error: 'Failed to update profile'
      });
    }
  }

  // GET /api/users/search - Rechercher des users
  static async searchUsers(req: Request, res: Response) {
    try {
      const query = req.query.q as string;

      if (!query || query.trim().length === 0) {
        return res.status(400).json({
          error: 'Search query is required'
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await UserService.searchUsers(query, page, limit);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Search users error:', error);
      return res.status(500).json({
        error: 'Failed to search users'
      });
    }
  }
}



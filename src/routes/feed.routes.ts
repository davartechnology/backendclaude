import { Router } from 'express';
import { FeedController } from '../controllers/feed.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Routes protégées (auth requise)
router.get('/for-you', authMiddleware, FeedController.getForYouFeed);
router.get('/following', authMiddleware, FeedController.getFollowingFeed);

// Routes publiques
router.get('/trending', FeedController.getTrendingFeed);
router.get('/search', FeedController.searchVideos);

export default router;
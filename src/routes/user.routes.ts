import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';

const router = Router();

// Routes publiques (avec auth optionnelle pour isFollowing)
router.get('/search', UserController.searchUsers);
router.get('/:id', optionalAuthMiddleware, UserController.getProfile);
router.get('/:id/followers', UserController.getFollowers);
router.get('/:id/following', UserController.getFollowing);

// Routes protégées (auth requise)
router.post('/:id/follow', authMiddleware, UserController.followUser);
router.delete('/:id/follow', authMiddleware, UserController.unfollowUser);
router.put('/me', authMiddleware, UserController.updateProfile);

export default router;
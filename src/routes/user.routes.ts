import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';

const router = Router();

// Routes spécifiques (avant les paramètres dynamiques)
router.get('/search', UserController.searchUsers);
router.get('/profile', authMiddleware, UserController.getMe);
router.put('/profile', authMiddleware, UserController.updateProfile);

// Routes avec paramètres dynamiques
router.get('/:id', optionalAuthMiddleware, UserController.getProfile);
router.get('/:id/followers', UserController.getFollowers);
router.get('/:id/following', UserController.getFollowing);

// Routes protégées (auth requise)
router.post('/:id/follow', authMiddleware, UserController.followUser);
router.delete('/:id/follow', authMiddleware, UserController.unfollowUser);
router.put('/:id', authMiddleware, UserController.updateProfile);

export default router;
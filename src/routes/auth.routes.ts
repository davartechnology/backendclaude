import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Routes publiques (pas besoin de token)
router.post('/signup', AuthController.signup);
router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refresh);

// Routes protégées (besoin d'un token)
router.get('/me', authMiddleware, AuthController.getMe);
router.post('/logout', authMiddleware, AuthController.logout);

export default router;
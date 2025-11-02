import { Router } from 'express';
import multer from 'multer';
import { VideoController } from '../controllers/video.controller';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';

const router = Router();

// Configuration Multer pour upload
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max
  },
  fileFilter: (req, file, cb) => {
    // Accepter seulement les vidéos
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  }
});

// Routes publiques (avec auth optionnelle)
router.get('/:id', optionalAuthMiddleware, VideoController.getVideo);
router.get('/user/:userId', VideoController.getUserVideos);
router.post('/:id/view', VideoController.incrementView);
router.get('/:id/comments', VideoController.getComments);

// Routes protégées (auth requise)
router.post('/', authMiddleware, upload.single('video'), VideoController.uploadVideo);
router.delete('/:id', authMiddleware, VideoController.deleteVideo);
router.post('/:id/like', authMiddleware, VideoController.likeVideo);
router.delete('/:id/like', authMiddleware, VideoController.unlikeVideo);
router.post('/:id/favorite', authMiddleware, VideoController.addToFavorites);
router.delete('/:id/favorite', authMiddleware, VideoController.removeFromFavorites);
router.get('/favorites/me', authMiddleware, VideoController.getMyFavorites);
router.post('/:id/share', authMiddleware, VideoController.shareVideo);
router.post('/:id/comments', authMiddleware, VideoController.addComment);

export default router;
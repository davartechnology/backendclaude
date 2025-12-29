import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { DistributionJob } from './jobs/distribution.job';
import { prisma } from './lib/prisma';

// Import des routes (déplacés en haut pour plus de clarté)
import authRoutes from './routes/auth.routes';
import videoRoutes from './routes/video.routes';
import feedRoutes from './routes/feed.routes';
import userRoutes from './routes/user.routes';
import setsRoutes from './routes/sets.routes';
import balanceRoutes from './routes/balance.routes';
import withdrawalRoutes from './routes/withdrawal.routes';
import liveRoutes from './routes/live.routes';
import giftRoutes from './routes/gift.routes';
import boostRoutes from './routes/boost.routes';

// Charger variables d'environnement
dotenv.config();

// Créer l'application Express
const app: Application = express();

// Créer serveur HTTP pour Socket.io
const httpServer = createServer(app);

// Initialiser Socket.io avec une config CORS permissive pour le dev
const io = new Server(httpServer, {
  cors: {
    origin: true, // Autorise l'origine de la requête (indispensable pour Chrome/Flutter Web)
    methods: ["GET", "POST"],
    credentials: true
  }
});

// --- MIDDLEWARES ---

// Helmet aide à sécuriser l'app, mais en mode dev, on assouplit pour éviter de bloquer Flutter
app.use(helmet({
  crossOriginResourcePolicy: false, // Permet de charger des images/vidéos depuis d'autres domaines (ex: Cloudinary)
  contentSecurityPolicy: false,     // Évite les erreurs CSP sur les navigateurs en développement
}));

// CONFIGURATION CORS CORRIGÉE
app.use(cors({
  origin: true, // Crucial : renvoie l'origine de la requête au lieu de '*' pour accepter les credentials
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log de débogage pour voir les requêtes entrantes dans votre terminal
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// --- ROUTES ---

// Route de test
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: '🚀 API TikTok-like Backend',
    status: 'running',
    version: '1.0.0'
  });
});

// Health check
app.get('/health', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Utiliser les routes API
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sets', setsRoutes);
app.use('/api/balance', balanceRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/lives', liveRoutes);
app.use('/api/gifts', giftRoutes);
app.use('/api/boost', boostRoutes);

// --- GESTION D'ERREURS ---

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path
  });
});

// Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Server Error:', err);
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue'
  });
});

// Setup WebSocket
import { setupLiveWebSocket } from './websocket/live.socket';
setupLiveWebSocket(io);

// Démarrer le job de distribution
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DISTRIBUTION_JOB === 'true') {
  DistributionJob.start();
}

// Démarrer le serveur
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`
  🚀 Server running on port ${PORT}
  📝 Environment: ${process.env.NODE_ENV || 'development'}
  🗄️  Database: Connected
  💬 WebSocket: Ready
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
  await prisma.$disconnect();
  process.exit(0);
});

export default app;
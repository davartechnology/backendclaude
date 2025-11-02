import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { DistributionJob } from './jobs/distribution.job';
import setsRoutes from './routes/sets.routes';


// Charger variables d'environnement
dotenv.config();

// Initialiser Prisma
export const prisma = new PrismaClient();

// Créer l'application Express
const app: Application = express();

// Middleware
app.use(helmet()); // Sécurité
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json()); // Parser JSON
app.use(express.urlencoded({ extended: true }));


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
    // Tester la connexion DB
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

// Import des routes (on les créera après)
import authRoutes from './routes/auth.routes';
import videoRoutes from './routes/video.routes';
import balanceRoutes from './routes/balance.routes';
import withdrawalRoutes from './routes/withdrawal.routes';
import feedRoutes from './routes/feed.routes';
import userRoutes from './routes/user.routes';

// import userRoutes from './routes/user.routes';


// Utiliser les routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/sets', setsRoutes);
app.use('/api/balance', balanceRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/users', userRoutes);
// app.use('/api/users', userRoutes);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path
  });
});

// Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Démarrer le job de distribution
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DISTRIBUTION_JOB === 'true') {
  DistributionJob.start();
  console.log('🚀 Distribution job started');
}

// Démarrer le serveur
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`
🚀 Server running on port ${PORT}
📝 Environment: ${process.env.NODE_ENV || 'development'}
🗄️  Database: Connected
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
  await prisma.$disconnect();
  process.exit(0);
});

export default app;

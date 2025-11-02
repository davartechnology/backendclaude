import { Request, Response } from 'express';
import { SetsService } from '../services/sets.service';
import { DistributionService } from '../services/distribution.service';
import { DistributionJob } from '../jobs/distribution.job';

export class SetsController {
  // GET /api/sets/user/:userId/today - Stats du jour d'un user
  static async getUserDailyStats(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      const stats = await SetsService.getUserDailyStats(userId);

      return res.status(200).json({ stats });
    } catch (error) {
      console.error('Get user daily stats error:', error);
      return res.status(500).json({
        error: 'Failed to get daily stats'
      });
    }
  }

  // GET /api/sets/user/:userId/history - Historique sets user
  static async getUserHistory(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const history = await SetsService.getUserSetsHistory(userId, days);

      return res.status(200).json({ history });
    } catch (error) {
      console.error('Get user history error:', error);
      return res.status(500).json({
        error: 'Failed to get history'
      });
    }
  }

  // GET /api/sets/top - Top users par sets (jour donné)
  static async getTopUsers(req: Request, res: Response) {
    try {
      const dateStr = req.query.date as string;
      const date = dateStr ? new Date(dateStr) : new Date();
      date.setHours(0, 0, 0, 0);

      const limit = parseInt(req.query.limit as string) || 100;

      const topUsers = await SetsService.getTopUsersByDate(date, limit);

      return res.status(200).json({
        date,
        topUsers
      });
    } catch (error) {
      console.error('Get top users error:', error);
      return res.status(500).json({
        error: 'Failed to get top users'
      });
    }
  }

  // GET /api/sets/global/stats - Stats globales d'un jour
  static async getGlobalStats(req: Request, res: Response) {
    try {
      const dateStr = req.query.date as string;
      const date = dateStr ? new Date(dateStr) : new Date();
      date.setHours(0, 0, 0, 0);

      const stats = await SetsService.getGlobalDayStats(date);

      return res.status(200).json(stats);
    } catch (error) {
      console.error('Get global stats error:', error);
      return res.status(500).json({
        error: 'Failed to get global stats'
      });
    }
  }

  // GET /api/sets/user/:userId/suspicious - Détecter activité suspecte
  static async checkSuspiciousActivity(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      const result = await SetsService.detectSuspiciousActivity(userId);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Check suspicious error:', error);
      return res.status(500).json({
        error: 'Failed to check activity'
      });
    }
  }

  // GET /api/sets/distribution/history/:userId - Historique distributions user
  static async getUserDistributions(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 30;

      const history = await DistributionService.getUserDistributionHistory(userId, limit);

      return res.status(200).json({ history });
    } catch (error) {
      console.error('Get distributions error:', error);
      return res.status(500).json({
        error: 'Failed to get distributions'
      });
    }
  }

  // GET /api/sets/distribution/stats - Stats distribution globales
  static async getDistributionStats(req: Request, res: Response) {
    try {
      const days = parseInt(req.query.days as string) || 30;

      const stats = await DistributionService.getGlobalDistributionStats(days);

      return res.status(200).json(stats);
    } catch (error) {
      console.error('Get distribution stats error:', error);
      return res.status(500).json({
        error: 'Failed to get distribution stats'
      });
    }
  }

  // POST /api/sets/distribution/trigger - Forcer distribution (ADMIN)
  static async triggerDistribution(req: Request, res: Response) {
    try {
      // TODO: Ajouter vérification admin

      const result = await DistributionJob.runNow();

      return res.status(200).json({
        message: 'Distribution triggered',
        result
      });
    } catch (error) {
      console.error('Trigger distribution error:', error);
      return res.status(500).json({
        error: 'Failed to trigger distribution'
      });
    }
  }

  // GET /api/sets/distribution/job/status - Statut du cron job
  static async getJobStatus(req: Request, res: Response) {
    try {
      const status = DistributionJob.getStatus();

      return res.status(200).json(status);
    } catch (error) {
      console.error('Get job status error:', error);
      return res.status(500).json({
        error: 'Failed to get job status'
      });
    }
  }
}
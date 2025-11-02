
import { Request, Response } from 'express';
import { WithdrawalService } from '../services/withdrawal.service';

export class WithdrawalController {
  // POST /api/withdrawals - Créer une demande de retrait
  static async createWithdrawal(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const { amount, method, paymentDetails } = req.body;

      // Validation
      if (!amount || !method || !paymentDetails) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['amount', 'method', 'paymentDetails']
        });
      }

      if (amount <= 0) {
        return res.status(400).json({
          error: 'Amount must be greater than 0'
        });
      }

      const result = await WithdrawalService.createWithdrawal({
        userId,
        amount,
        method,
        paymentDetails
      });

      return res.status(201).json({
        message: 'Withdrawal request created',
        withdrawal: result.withdrawal,
        estimatedProcessingTime: result.estimatedProcessingTime
      });
    } catch (error) {
      if (error instanceof Error) {
        // Erreurs connues
        if (
          error.message.includes('Minimum amount') ||
          error.message.includes('Insufficient balance') ||
          error.message.includes('once per month') ||
          error.message.includes('required')
        ) {
          return res.status(400).json({ error: error.message });
        }
      }
      console.error('Create withdrawal error:', error);
      return res.status(500).json({
        error: 'Failed to create withdrawal request'
      });
    }
  }

  // GET /api/withdrawals - Liste des retraits de l'user
  static async getUserWithdrawals(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const limit = parseInt(req.query.limit as string) || 50;

      const withdrawals = await WithdrawalService.getUserWithdrawals(userId, limit);

      return res.status(200).json({
        withdrawals
      });
    } catch (error) {
      console.error('Get withdrawals error:', error);
      return res.status(500).json({
        error: 'Failed to get withdrawals'
      });
    }
  }

  // GET /api/withdrawals/:id - Détails d'un retrait
  static async getWithdrawal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const withdrawal = await WithdrawalService.getWithdrawalById(id, userId);

      return res.status(200).json({
        withdrawal
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Withdrawal not found') {
          return res.status(404).json({ error: 'Withdrawal not found' });
        }
        if (error.message === 'Unauthorized') {
          return res.status(403).json({ error: 'Unauthorized' });
        }
      }
      console.error('Get withdrawal error:', error);
      return res.status(500).json({
        error: 'Failed to get withdrawal'
      });
    }
  }

  // GET /api/withdrawals/methods - Liste des méthodes disponibles
  static async getMethods(req: Request, res: Response) {
    try {
      const methods = [
        {
          id: 'paypal',
          name: 'PayPal',
          minAmount: 3,
          fee: 0.30,
          processingTime: '2-5 jours',
          icon: '💰'
        },
        {
          id: 'mobile',
          name: 'Recharge Mobile',
          minAmount: 5,
          fee: 0.50,
          processingTime: 'Instantané',
          icon: '📱'
        },
        {
          id: 'bank',
          name: 'Virement Bancaire',
          minAmount: 100,
          fee: 2,
          processingTime: '5-10 jours',
          icon: '🏦'
        },
        {
          id: 'western_union',
          name: 'Western Union',
          minAmount: 50,
          fee: 5,
          processingTime: '1-3 jours',
          icon: '💵'
        }
      ];

      return res.status(200).json({ methods });
    } catch (error) {
      console.error('Get methods error:', error);
      return res.status(500).json({
        error: 'Failed to get methods'
      });
    }
  }

  // ========== ADMIN ENDPOINTS ==========

  // GET /api/withdrawals/admin/pending - Retraits en attente (ADMIN)
  static async getPendingWithdrawals(req: Request, res: Response) {
    try {
      // TODO: Ajouter vérification admin

      const limit = parseInt(req.query.limit as string) || 100;

      const withdrawals = await WithdrawalService.getPendingWithdrawals(limit);

      return res.status(200).json({
        withdrawals,
        count: withdrawals.length
      });
    } catch (error) {
      console.error('Get pending withdrawals error:', error);
      return res.status(500).json({
        error: 'Failed to get pending withdrawals'
      });
    }
  }

  // POST /api/withdrawals/:id/approve - Approuver (ADMIN)
  static async approveWithdrawal(req: Request, res: Response) {
    try {
      // TODO: Ajouter vérification admin

      const { id } = req.params;

      const result = await WithdrawalService.approveWithdrawal(id);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Withdrawal not found') {
          return res.status(404).json({ error: 'Withdrawal not found' });
        }
        if (error.message.includes('already processed')) {
          return res.status(400).json({ error: error.message });
        }
      }
      console.error('Approve withdrawal error:', error);
      return res.status(500).json({
        error: 'Failed to approve withdrawal'
      });
    }
  }

  // POST /api/withdrawals/:id/reject - Rejeter (ADMIN)
  static async rejectWithdrawal(req: Request, res: Response) {
    try {
      // TODO: Ajouter vérification admin

      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          error: 'Rejection reason is required'
        });
      }

      const result = await WithdrawalService.rejectWithdrawal(id, reason);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Withdrawal not found') {
          return res.status(404).json({ error: 'Withdrawal not found' });
        }
        if (error.message.includes('already processed')) {
          return res.status(400).json({ error: error.message });
        }
      }
      console.error('Reject withdrawal error:', error);
      return res.status(500).json({
        error: 'Failed to reject withdrawal'
      });
    }
  }

  // GET /api/withdrawals/admin/stats - Stats (ADMIN)
  static async getStats(req: Request, res: Response) {
    try {
      // TODO: Ajouter vérification admin

      const days = parseInt(req.query.days as string) || 30;

      const stats = await WithdrawalService.getWithdrawalStats(days);

      return res.status(200).json(stats);
    } catch (error) {
      console.error('Get withdrawal stats error:', error);
      return res.status(500).json({
        error: 'Failed to get stats'
      });
    }
  }
}
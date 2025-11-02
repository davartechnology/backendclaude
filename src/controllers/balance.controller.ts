import { Request, Response } from 'express';
import { prisma } from '../server';
import { DistributionService } from '../services/distribution.service';
import { Prisma } from '@prisma/client';

// Initialiser la classe Decimal pour la cohérence
const DecimalClass = Prisma.Decimal;

export class BalanceController {
  // GET /api/balance - Voir sa balance
  static async getBalance(req: Request, res: Response) {
    try {
      // Assurez-vous que req.userId est défini par votre middleware d'authentification
      const userId = req.userId!; 

      const balance = await prisma.userBalance.findUnique({
        where: { userId }
      });

      if (!balance) {
        return res.status(404).json({
          error: 'Balance not found'
        });
      }

      // Conversion des Decimals en String pour l'API
      return res.status(200).json({
        balance: {
          available: balance.availableBalance.toString(),
          gifts: balance.giftBalance.toString(),
          pending: balance.pendingBalance.toString(),
          lifetimeEarnings: balance.lifetimeEarnings.toString(),
          totalWithdrawn: balance.totalWithdrawn.toString(),
          lastWithdrawal: balance.lastWithdrawal // Ceci est un Date, pas un Decimal
        }
      });
    } catch (error) {
      console.error('Get balance error:', error);
      return res.status(500).json({
        error: 'Failed to get balance'
      });
    }
  }

  // GET /api/balance/history - Historique des gains
  static async getHistory(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const limit = parseInt(req.query.limit as string) || 30;

      // Récupérer les distributions (rémunération)
      const distributions = await DistributionService.getUserDistributionHistory(userId, limit);

      // Récupérer les gifts reçus
      const giftsReceived = await prisma.gift.findMany({
        where: {
          receiverId: userId,
          isFree: false // Seulement les gifts payants
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              avatarUrl: true
            }
          },
          liveStream: {
            select: {
              id: true,
              title: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit
      });

      // Constante pour la commission
      const commissionRate = new DecimalClass(0.7);

      // Combiner et trier par date
      const history = [
        ...distributions.map(d => ({
          type: 'distribution',
          date: d.date,
          // d.amountEarned et d.totalSets sont déjà des Decimals
          amount: d.amountEarned.toString(),
          details: {
            sets: d.totalSets.toString(),
            setValue: d.pool.setValueInDollars.toString()
          }
        })),
        ...giftsReceived.map(g => ({
          type: 'gift',
          date: g.createdAt,
          // CORRECTION 1 : Utiliser .mul() pour le calcul de commission
          amount: g.value.mul(commissionRate).toString(), // 70% après commission
          details: {
            giftType: g.type,
            sender: g.sender,
            liveStream: g.liveStream
          }
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return res.status(200).json({
        history: history.slice(0, limit)
      });
    } catch (error) {
      console.error('Get history error:', error);
      return res.status(500).json({
        error: 'Failed to get history'
      });
    }
  }

  // GET /api/balance/stats - Statistiques du mois
  static async getStats(req: Request, res: Response) {
    try {
      const userId = req.userId!;

      // Date début du mois
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Gains ce mois via distributions
      const distributions = await prisma.setDistribution.aggregate({
        where: {
          userId,
          date: { gte: startOfMonth },
          status: 'credited'
        },
        _sum: {
          amountEarned: true,
          totalSets: true
        }
      });

      // Gifts reçus ce mois
      const gifts = await prisma.gift.aggregate({
        where: {
          receiverId: userId,
          createdAt: { gte: startOfMonth },
          isFree: false
        },
        _sum: {
          value: true
        }
      });

      // Utiliser des Decimals pour les calculs
      const commissionRate = new DecimalClass(0.7);

      // CORRECTION 2, 3, 4 : S'assurer que toutes les variables sont des Decimals pour le calcul
      const totalDistributionsDecimal = distributions._sum.amountEarned || new DecimalClass(0);
      const totalSetsDecimal = distributions._sum.totalSets || new DecimalClass(0);
      const giftsValueDecimal = gifts._sum.value || new DecimalClass(0);

      // Calcul des cadeaux (70% après commission)
      const totalGiftsDecimal = giftsValueDecimal.mul(commissionRate);

      // Calcul du total des gains
      const totalEarningsDecimal = totalDistributionsDecimal.add(totalGiftsDecimal);

      // Calcul de la moyenne des sets
      const daysInMonthSoFar = Math.max(1, new Date().getDate());
      // CORRECTION 5 : Division en JS après conversion en number
      const averageSets = (totalSetsDecimal.toNumber() / daysInMonthSoFar).toFixed(2);


      return res.status(200).json({
        month: {
          start: startOfMonth,
          end: new Date()
        },
        earnings: {
          distributions: totalDistributionsDecimal.toString(),
          gifts: totalGiftsDecimal.toString(),
          // CORRECTION 6 : Utilisation du Decimal pour l'addition
          total: totalEarningsDecimal.toString() 
        },
        sets: {
          total: totalSetsDecimal.toString(),
          // CORRECTION 7 : Utilisation de la variable averageSets calculée
          average: averageSets
        }
      });
    } catch (error) {
      console.error('Get stats error:', error);
      return res.status(500).json({
        error: 'Failed to get stats'
      });
    }
  }
}

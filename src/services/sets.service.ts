import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

// Initialiser la classe Decimal
const Decimal = Prisma.Decimal;

// Barème des SETS (points invisibles pour users)
// ... (pas de changement)
const SETS_CONFIG = {
  LIKE: 1,
  SHARE: 1,
  // ... (suite des configurations)
  COMMENT: 2,
  VIDEO_UPLOAD: 2,
  ACTIVE_TIME_PER_MINUTE: 0.5,
  VIEW_VIDEO: 0.5, // Si > 30 secondes
  RECEIVE_LIKE: 0.3,
  RECEIVE_COMMENT: 0.5,
  NEW_FOLLOWER: 1,
  TRENDING_VIDEO_BONUS: 5,
  SEND_GIFT: 1,
  LIVE_STREAM_PER_MINUTE: 2,
  WATCH_LIVE_PER_MINUTE: 0.3
};

// Limites quotidiennes (anti-fraude)
// ... (pas de changement)
const DAILY_LIMITS = {
  MAX_LIKES: 500,
  MAX_COMMENTS: 100,
  MAX_SHARES: 50,
  MAX_VIDEOS: 10,
  MAX_ACTIVE_TIME_MINUTES: 480, // 8 heures
  MAX_LIVE_STREAM_MINUTES: 240 // 4 heures
};

export class SetsService {
  // Ajouter des sets à un utilisateur
  static async addSets(
    userId: string,
    actionType: string,
    amount: number, // L'entrée est en number, on la convertit
    targetId?: string
  ) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Le montant à incrémenter doit être un Decimal
      const amountDecimal = new Decimal(amount); 
      
      // Récupérer ou créer DailySets du jour
      let dailySets = await prisma.dailySets.findUnique({
        where: {
          userId_date: {
            userId,
            date: today
          }
        }
      });

      if (!dailySets) {
        dailySets = await prisma.dailySets.create({
          data: {
            userId,
            date: today
          }
        });
      }

      // Vérifier les limites selon le type d'action
      let canAdd = true;
      let fieldToUpdate = '';
      
      // Ligne 73 CORRIGÉE : Utiliser Prisma.Decimal comme type
      let limitSets: Prisma.Decimal; 

      switch (actionType) {
        case 'like':
          fieldToUpdate = 'likeSets';
          limitSets = new Decimal(DAILY_LIMITS.MAX_LIKES * SETS_CONFIG.LIKE);
          canAdd = dailySets.likeSets.lessThan(limitSets);
          break;
        case 'comment':
          fieldToUpdate = 'commentSets';
          limitSets = new Decimal(DAILY_LIMITS.MAX_COMMENTS).mul(new Decimal(SETS_CONFIG.COMMENT));
          canAdd = dailySets.commentSets.lessThan(limitSets);
          break;
        case 'share':
          fieldToUpdate = 'shareSets';
          limitSets = new Decimal(DAILY_LIMITS.MAX_SHARES * SETS_CONFIG.SHARE);
          canAdd = dailySets.shareSets.lessThan(limitSets);
          break;
        case 'video_upload':
          fieldToUpdate = 'videoSets';
          limitSets = new Decimal(DAILY_LIMITS.MAX_VIDEOS).mul(new Decimal(SETS_CONFIG.VIDEO_UPLOAD));
          canAdd = dailySets.videoSets.lessThan(limitSets);
          break;
        case 'active_time':
          fieldToUpdate = 'activeTimeSets';
          limitSets = new Decimal(DAILY_LIMITS.MAX_ACTIVE_TIME_MINUTES).mul(new Decimal(SETS_CONFIG.ACTIVE_TIME_PER_MINUTE));
          canAdd = dailySets.activeTimeSets.lessThan(limitSets);
          break;
        case 'live_stream':
          fieldToUpdate = 'liveStreamSets';
          limitSets = new Decimal(DAILY_LIMITS.MAX_LIVE_STREAM_MINUTES).mul(new Decimal(SETS_CONFIG.LIVE_STREAM_PER_MINUTE));
          canAdd = dailySets.liveStreamSets.lessThan(limitSets);
          break;
        case 'view':
          fieldToUpdate = 'viewSets';
          break;
        case 'receive_like':
          fieldToUpdate = 'receiveLikeSets';
          break;
        case 'receive_comment':
          fieldToUpdate = 'receiveCommentSets';
          break;
        case 'follower':
          fieldToUpdate = 'followerSets';
          break;
        case 'gift':
          fieldToUpdate = 'giftSets';
          break;
        case 'watch_live':
          fieldToUpdate = 'watchLiveSets';
          break;
        default:
          throw new Error('Invalid action type');
      }

      if (!canAdd) {
        console.log(`Daily limit reached for ${actionType} - userId: ${userId}`);
        return { success: false, reason: 'Daily limit reached' };
      }

      // Mettre à jour les sets
      const updateData: any = {
        totalSets: { increment: amountDecimal }
      };
      updateData[fieldToUpdate] = { increment: amountDecimal };

      await prisma.dailySets.update({
        where: {
          userId_date: {
            userId,
            date: today
          }
        },
        data: updateData
      });

      // Logger l'activité
      await prisma.activityLog.create({
        data: {
          userId,
          actionType,
          targetId,
          setsEarned: amountDecimal,
          timestamp: new Date()
        }
      });

      // Mettre à jour pendingBalance (estimation)
      await this.updatePendingBalance(userId);

      return { success: true, setsAdded: amountDecimal.toNumber() };
    } catch (error) {
      console.error('Error adding sets:', error);
      return { success: false, reason: 'Internal error' };
    }
  }

  // Mettre à jour la balance en attente (estimation)
  static async updatePendingBalance(userId: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Récupérer les sets du jour
      const dailySets = await prisma.dailySets.findUnique({
        where: {
          userId_date: {
            userId,
            date: today
          }
        }
      });

      if (!dailySets) return;

      const estimatedValue = dailySets.totalSets.mul(new Decimal(0.01));

      await prisma.userBalance.update({
        where: { userId },
        data: {
          pendingBalance: estimatedValue
        }
      });
    } catch (error) {
      console.error('Error updating pending balance:', error);
    }
  }

  // Récupérer les stats du jour pour un user
  static async getUserDailyStats(userId: string, date?: Date) {
    const targetDate = date || new Date();
    targetDate.setHours(0, 0, 0, 0);

    const dailySets = await prisma.dailySets.findUnique({
      where: {
        userId_date: {
          userId,
          date: targetDate
        }
      }
    });

    return dailySets || {
      userId,
      date: targetDate,
      likeSets: new Decimal(0),
      shareSets: new Decimal(0),
      commentSets: new Decimal(0),
      videoSets: new Decimal(0),
      activeTimeSets: new Decimal(0),
      viewSets: new Decimal(0),
      receiveLikeSets: new Decimal(0),
      receiveCommentSets: new Decimal(0),
      followerSets: new Decimal(0),
      giftSets: new Decimal(0),
      liveStreamSets: new Decimal(0),
      watchLiveSets: new Decimal(0),
      totalSets: new Decimal(0)
    };
  }

  // Récupérer l'historique des sets sur X jours
  static async getUserSetsHistory(userId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const history = await prisma.dailySets.findMany({
      where: {
        userId,
        date: {
          gte: startDate
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    return history;
  }

  // Récupérer le top X users par sets (pour un jour donné)
  static async getTopUsersByDate(date: Date, limit: number = 100) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const topUsers = await prisma.dailySets.findMany({
      where: {
        date: targetDate
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true
          }
        }
      },
      orderBy: {
        totalSets: 'desc'
      },
      take: limit
    });

    return topUsers;
  }

  // Récupérer les stats globales d'un jour
  static async getGlobalDayStats(date: Date) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const stats = await prisma.dailySets.aggregate({
      where: {
        date: targetDate
      },
      _sum: {
        totalSets: true,
        likeSets: true,
        commentSets: true,
        videoSets: true,
        activeTimeSets: true,
        viewSets: true
      },
      _count: {
        userId: true
      }
    });

    return {
      date: targetDate,
      totalSets: stats._sum.totalSets?.toNumber() || 0,
      totalUsers: stats._count.userId,
      breakdown: {
        likeSets: stats._sum.likeSets?.toNumber() || 0,
        commentSets: stats._sum.commentSets?.toNumber() || 0,
        videoSets: stats._sum.videoSets?.toNumber() || 0,
        activeTimeSets: stats._sum.activeTimeSets?.toNumber() || 0,
        viewSets: stats._sum.viewSets?.toNumber() || 0
      }
    };
  }

  // Détecter les comportements suspects (anti-fraude)
  static async detectSuspiciousActivity(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailySets = await prisma.dailySets.findUnique({
      where: {
        userId_date: {
          userId,
          date: today
        }
      }
    });

    if (!dailySets) return { suspicious: false };

    const suspiciousFlags = [];

    // Limites de 90%
    const ninetyPercent = new Decimal(0.9);
    const likeLimit = new Decimal(DAILY_LIMITS.MAX_LIKES).mul(ninetyPercent);
    const commentLimit = new Decimal(DAILY_LIMITS.MAX_COMMENTS).mul(new Decimal(SETS_CONFIG.COMMENT)).mul(ninetyPercent);

    // Trop de likes
    if (dailySets.likeSets.greaterThan(likeLimit)) {
      suspiciousFlags.push('High like count');
    }

    // Trop de commentaires
    if (dailySets.commentSets.greaterThan(commentLimit)) {
      suspiciousFlags.push('High comment count');
    }

    // Pattern anormal (ex: beaucoup de likes mais 0 views)
    if (dailySets.likeSets.greaterThan(new Decimal(100)) && dailySets.viewSets.lessThan(new Decimal(10))) {
      suspiciousFlags.push('Abnormal like/view ratio');
    }

    return {
      suspicious: suspiciousFlags.length > 0,
      flags: suspiciousFlags,
      dailySets
    };
  }
}
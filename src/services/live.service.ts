import { prisma } from '../lib/prisma';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import { SetsService } from './sets.service';

// Constante pour les calculs monétaires
const CREATOR_COMMISSION_RATE = 0.7; // 70% du montant du cadeau revient au créateur

export class LiveService {
  // Créer un live stream
  static async createLiveStream(userId: string, title: string) {
    // Générer un channel ID unique
    const channelName = `live_${userId}_${Date.now()}`;

    // Créer le live dans DB
    const liveStream = await prisma.liveStream.create({
      data: {
        userId,
        agoraChannelId: channelName,
        title,
        isActive: true
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            isVerified: true
          }
        }
      }
    });

    // Générer token Agora pour le streamer (publisher)
    const token = this.generateAgoraToken(channelName, userId, true);

    return {
      liveStream,
      token,
      channelName
    };
  }

  // Générer token Agora
  static generateAgoraToken(channelName: string, userId: string, isPublisher: boolean = false): string {
    const appId = process.env.AGORA_APP_ID!;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE!;
    
    const uid = 0; // 0 = auto-assign
    const role = isPublisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const expirationTimeInSeconds = 3600; // 1 heure
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );

    return token;
  }

  // Rejoindre un live (viewer)
  static async joinLiveStream(liveId: string, userId: string) {
    const liveStream = await prisma.liveStream.findUnique({
      where: { id: liveId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            isVerified: true
          }
        }
      }
    });

    if (!liveStream) {
      throw new Error('Live stream not found');
    }

    if (!liveStream.isActive) {
      throw new Error('Live stream is not active');
    }

    // Incrémenter viewer count
    await prisma.liveStream.update({
      where: { id: liveId },
      data: { 
        viewerCount: { increment: 1 },
        totalViews: { increment: 1 },
        peakViewers: {
          set: Math.max(liveStream.peakViewers, liveStream.viewerCount + 1)
        }
      }
    });

    // Générer token pour viewer
    const token = this.generateAgoraToken(liveStream.agoraChannelId, userId, false);

    return {
      liveStream,
      token,
      channelName: liveStream.agoraChannelId
    };
  }

  // Quitter un live (viewer)
  static async leaveLiveStream(liveId: string, userId: string) {
    const liveStream = await prisma.liveStream.findUnique({
      where: { id: liveId }
    });

    if (!liveStream) {
      throw new Error('Live stream not found');
    }

    // Décrémenter viewer count
    await prisma.liveStream.update({
      where: { id: liveId },
      data: { 
        viewerCount: { decrement: 1 }
      }
    });

    return { message: 'Left live stream' };
  }

  // Terminer un live (streamer)
  static async endLiveStream(liveId: string, userId: string) {
    const liveStream = await prisma.liveStream.findUnique({
      where: { id: liveId }
    });

    if (!liveStream) {
      throw new Error('Live stream not found');
    }

    if (liveStream.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // Marquer comme terminé
    await prisma.liveStream.update({
      where: { id: liveId },
      data: {
        isActive: false,
        endedAt: new Date(),
        viewerCount: 0
      }
    });

    // Calculer la durée en minutes
    const durationMinutes = Math.floor(
      (Date.now() - liveStream.startedAt.getTime()) / (1000 * 60)
    );

    // ⭐ AJOUTER SETS : Live streaming = 2 sets/minute
    const setsEarned = durationMinutes * 2;
    await SetsService.addSets(userId, 'live_stream', setsEarned, liveId);

    return { 
      message: 'Live stream ended',
      stats: {
        duration: durationMinutes,
        peakViewers: liveStream.peakViewers,
        totalViews: liveStream.totalViews,
        setsEarned
      }
    };
  }

  // Récupérer les lives actifs
  static async getActiveLiveStreams(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const liveStreams = await prisma.liveStream.findMany({
      where: { isActive: true },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            isVerified: true,
            followersCount: true
          }
        }
      },
      orderBy: [
        { viewerCount: 'desc' },
        { startedAt: 'desc' }
      ],
      skip,
      take: limit
    });

    const total = await prisma.liveStream.count({
      where: { isActive: true }
    });

    return {
      liveStreams,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Récupérer un live par ID
  static async getLiveStreamById(liveId: string) {
    const liveStream = await prisma.liveStream.findUnique({
      where: { id: liveId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            isVerified: true,
            followersCount: true
          }
        }
      }
    });

    if (!liveStream) {
      throw new Error('Live stream not found');
    }

    return liveStream;
  }

  // Envoyer un gift dans un live
  static async sendGift(
    liveId: string,
    senderId: string,
    giftType: string,
    useFreeBalance: boolean = false
  ) {
    const liveStream = await prisma.liveStream.findUnique({
      where: { id: liveId }
    });

    if (!liveStream) {
      throw new Error('Live stream not found');
    }

    if (!liveStream.isActive) {
      throw new Error('Live stream is not active');
    }

    // Prix des gifts
    const giftPrices: Record<string, number> = {
      rose: 0.99,
      heart: 1.99,
      diamond: 4.99,
      crown: 9.99,
      rocket: 19.99
    };

    const giftValue = giftPrices[giftType];
    if (!giftValue) {
      throw new Error('Invalid gift type');
    }

    // Récupérer la balance du sender
    const balance = await prisma.userBalance.findUnique({
      where: { userId: senderId }
    });

    if (!balance) {
      throw new Error('Balance not found');
    }

    // Vérifier les fonds selon le type de balance
    if (useFreeBalance) {
      // Utiliser giftBalance (gratuite via rewarded ads)
      // CORRECTION: Convertir le Decimal en number pour la comparaison
      if (balance.giftBalance.toNumber() < giftValue) {
        throw new Error('Insufficient gift balance');
      }

      // Débiter giftBalance
      await prisma.userBalance.update({
        where: { userId: senderId },
        data: {
          giftBalance: { decrement: giftValue }
        }
      });
    } else {
      // Utiliser availableBalance (retirable)
      // CORRECTION: Convertir le Decimal en number pour la comparaison
      if (balance.availableBalance.toNumber() < giftValue) {
        throw new Error('Insufficient balance');
      }

      // Débiter availableBalance
      await prisma.userBalance.update({
        where: { userId: senderId },
        data: {
          availableBalance: { decrement: giftValue }
        }
      });
    }

    // Créer le gift
    const gift = await prisma.gift.create({
      data: {
        senderId,
        receiverId: liveStream.userId,
        liveStreamId: liveId,
        type: giftType,
        value: giftValue,
        isFree: useFreeBalance
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatarUrl: true
          }
        }
      }
    });

    // Créditer le créateur (70% après commission)
    const creatorAmount = giftValue * CREATOR_COMMISSION_RATE; 
    
    await prisma.userBalance.update({
      where: { userId: liveStream.userId },
      data: {
        availableBalance: { increment: creatorAmount },
        lifetimeEarnings: { increment: creatorAmount }
      }
    });

    // ⭐ AJOUTER SETS : Envoyer gift = 1 set
    await SetsService.addSets(senderId, 'gift', 1, liveId);

    // Notification au créateur
    await prisma.notification.create({
      data: {
        userId: liveStream.userId,
        type: 'gift_received',
        title: '🎁 Gift reçu !',
        message: `${gift.sender.username} vous a envoyé un ${giftType} ($${giftValue}) !`
      }
    });

    return {
      gift,
      creatorEarned: creatorAmount
    };
  }

  // Récupérer les top gifters d'un live
  static async getTopGifters(liveId: string, limit: number = 10) {
    const gifts = await prisma.gift.groupBy({
      by: ['senderId'],
      where: { liveStreamId: liveId },
      _sum: {
        value: true
      },
      _count: {
        id: true
      },
      orderBy: {
        _sum: {
          value: 'desc'
        }
      },
      take: limit
    });

    // Récupérer les infos des senders
    const enrichedGifters = await Promise.all(
      gifts.map(async (g) => {
        const user = await prisma.user.findUnique({
          where: { id: g.senderId },
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            isVerified: true
          }
        });

        return {
          user,
          totalGifts: g._sum.value || 0,
          giftCount: g._count.id
        };
      })
    );

    return enrichedGifters;
  }
}
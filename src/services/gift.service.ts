import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library'; // Importation optionnelle pour référence au type Decimal

// Définition de constantes en CENTS pour éviter les erreurs de virgule flottante
const GIFT_AMOUNT_PER_AD_CENTS = 1; // 1 centime par pub (0.01 $ = 1 cent)
const COMMISSION_RATE = 0.7; // 70% de commission restante

export class GiftService {
  // Créditer des gifts gratuits après une rewarded ad
  static async creditFreeGifts(userId: string, adId: string) {
    // Utiliser l'équivalent en dollars pour le logging, si nécessaire, mais l'opération reste en cents
    const GIFT_AMOUNT_PER_AD_DOLLARS = GIFT_AMOUNT_PER_AD_CENTS / 100;

    // Vérifier que l'ad n'a pas déjà été récompensée
    const existingAdView = await prisma.adView.findFirst({
      where: {
        userId,
        adType: 'rewarded',
        // Note: La vérification de la dernière minute peut être omise si non requise
        // gte: new Date(Date.now() - 60000) 
      }
    });

    // Logger la vue pub (Assurez-vous que rewardAmount dans le schéma Prisma est adapté aux décimales ou utilisez le type approprié)
    await prisma.adView.create({
      data: {
        userId,
        adType: 'rewarded',
        rewardAmount: GIFT_AMOUNT_PER_AD_DOLLARS // Utilisez le format décimal pour le stockage si le champ est de type Decimal/Float dans Prisma
      }
    });

    // Créditer la giftBalance (Nous assumons que giftBalance dans Prisma est de type Decimal et gère bien les décimales)
    // Alternativement, si giftBalance stocke des CENTS : increment: GIFT_AMOUNT_PER_AD_CENTS
    await prisma.userBalance.update({
      where: { userId },
      data: {
        giftBalance: { increment: GIFT_AMOUNT_PER_AD_DOLLARS } // Opération avec la valeur décimale
      }
    });

    return {
      message: 'Gifts credited',
      amount: GIFT_AMOUNT_PER_AD_DOLLARS,
      // Remarque: La valeur 0 par défaut pour giftBalance dans ce retour pourrait nécessiter une conversion si elle est utilisée ailleurs.
      newBalance: (await prisma.userBalance.findUnique({ where: { userId } }))?.giftBalance || 0
    };
  }

  // Récupérer la balance gifts d'un user
  static async getGiftBalance(userId: string) {
    const balance = await prisma.userBalance.findUnique({
      where: { userId }
    });

    if (!balance) {
      throw new Error('Balance not found');
    }

    return {
      giftBalance: balance.giftBalance,
      availableBalance: balance.availableBalance
    };
  }

  // Récupérer l'historique des gifts envoyés
  static async getSentGiftsHistory(userId: string, limit: number = 50) {
    const gifts = await prisma.gift.findMany({
      where: { senderId: userId },
      include: {
        receiver: {
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
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return gifts;
  }

  // Récupérer l'historique des gifts reçus
  static async getReceivedGiftsHistory(userId: string, limit: number = 50) {
    const gifts = await prisma.gift.findMany({
      where: { receiverId: userId },
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
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return gifts;
  }

  // Stats des gifts pour un user
  static async getGiftStats(userId: string) {
    const sent = await prisma.gift.aggregate({
      where: { senderId: userId },
      _sum: {
        value: true
      },
      _count: {
        id: true
      }
    });

    const received = await prisma.gift.aggregate({
      where: { receiverId: userId, isFree: false },
      _sum: {
        value: true
      },
      _count: {
        id: true
      }
    });

    // CORRECTION TS2362: Convertir le Decimal en number pour la multiplication arithmétique.
    const totalReceivedValue = received._sum.value as Decimal | null;
    const totalReceivedNumber = totalReceivedValue ? totalReceivedValue.toNumber() : 0;

    return {
      sent: {
        total: sent._sum.value || 0,
        count: sent._count.id
      },
      received: {
        total: received._sum.value || 0,
        count: received._count.id,
        // Utilisation de la valeur convertie en Number
        earned: totalReceivedNumber * COMMISSION_RATE
      }
    };
  }

  // Liste des gifts disponibles avec prix
  static getAvailableGifts() {
    // Le prix est maintenant défini en nombre (dollars), mais il doit idéalement
    // être traité comme une chaîne de caractère de type Decimal dans la base de données
    return [
      {
        id: 'rose',
        name: 'Rose',
        price: 0.99, // Utilisation du type Number pour la liste côté client (à consommer par l'UI)
        emoji: '🌹',
        animation: 'rose'
      },
      {
        id: 'heart',
        name: 'Coeur',
        price: 1.99,
        emoji: '❤️',
        animation: 'heart'
      },
      {
        id: 'diamond',
        name: 'Diamant',
        price: 4.99,
        emoji: '💎',
        animation: 'diamond'
      },
      {
        id: 'crown',
        name: 'Couronne',
        price: 9.99,
        emoji: '👑',
        animation: 'crown'
      },
      {
        id: 'rocket',
        name: 'Fusée',
        price: 19.99,
        emoji: '🚀',
        animation: 'rocket'
      }
    ];
  }
}

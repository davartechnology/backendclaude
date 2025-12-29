import { prisma } from '../lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

// Packages de boost disponibles
const BOOST_PACKAGES = {
  mini: {
    id: 'mini',
    name: 'Mini Boost',
    price: 2.00,
    viewsPromised: 5000,
    duration: 48, // heures
    icon: '🌟'
  },
  standard: {
    id: 'standard',
    name: 'Standard Boost',
    price: 5.00,
    viewsPromised: 15000,
    duration: 48,
    icon: '⚡'
  },
  pro: {
    id: 'pro',
    name: 'Pro Boost',
    price: 10.00,
    viewsPromised: 35000,
    duration: 48,
    icon: '🚀'
  },
  viral: {
    id: 'viral',
    name: 'Viral Boost',
    price: 25.00,
    viewsPromised: 100000,
    duration: 48,
    icon: '💥'
  },
  mega: {
    id: 'mega',
    name: 'Mega Boost',
    price: 50.00,
    viewsPromised: 250000,
    duration: 48,
    icon: '🔥'
  }
};

export class BoostService {
  // Récupérer les packages disponibles
  static getPackages() {
    return Object.values(BOOST_PACKAGES);
  }

  // Créer un Payment Intent Stripe
  static async createPaymentIntent(userId: string, videoId: string, packageId: string) {
    // Vérifier que le package existe
    const packageData = BOOST_PACKAGES[packageId as keyof typeof BOOST_PACKAGES];
    if (!packageData) {
      throw new Error('Invalid package');
    }

    // Vérifier que la vidéo existe et appartient à l'user
    const video = await prisma.video.findUnique({
      where: { id: videoId }
    });

    if (!video) {
      throw new Error('Video not found');
    }

    if (video.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // Vérifier que la vidéo n'est pas déjà boostée
    const existingBoost = await prisma.boostCampaign.findUnique({
      where: { videoId }
    });

    if (existingBoost && existingBoost.status === 'active') {
      throw new Error('Video already boosted');
    }

    // Créer Payment Intent Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(packageData.price * 100), // Convertir en centimes
      currency: 'usd',
      metadata: {
        userId,
        videoId,
        packageId,
        type: 'boost'
      }
    });

    return {
      clientSecret: paymentIntent.client_secret,
      package: packageData
    };
  }

  // Créer une campagne boost après paiement réussi
  static async createBoostCampaign(userId: string, videoId: string, packageId: string, paymentIntentId: string) {
    const packageData = BOOST_PACKAGES[packageId as keyof typeof BOOST_PACKAGES];
    if (!packageData) {
      throw new Error('Invalid package');
    }

    // Vérifier le paiement Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      throw new Error('Payment not completed');
    }

    // Créer la campagne
    const campaign = await prisma.boostCampaign.create({
      data: {
        videoId,
        userId,
        package: packageId,
        price: packageData.price,
        viewsPromised: packageData.viewsPromised,
        status: 'active'
      },
      include: {
        video: {
          include: {
            user: {
              select: {
                id: true,
                username: true
              }
            }
          }
        }
      }
    });

    // Marquer la vidéo comme boostée
    await prisma.video.update({
      where: { id: videoId },
      data: { isBoosted: true }
    });

    // Créer transaction
    await prisma.transaction.create({
      data: {
        userId,
        type: 'boost',
        amount: packageData.price,
        stripePaymentId: paymentIntentId,
        status: 'completed'
      }
    });

    // Notification
    await prisma.notification.create({
      data: {
        userId,
        type: 'boost_activated',
        title: '🚀 Boost activé !',
        message: `Votre vidéo va recevoir ${packageData.viewsPromised.toLocaleString()} vues dans les 48h !`
      }
    });

    return campaign;
  }

  // Distribuer les impressions boostées
  static async distributeBoostImpressions(campaignId: string, userId: string, videoId: string) {
    // Créer une impression
    await prisma.boostImpression.create({
      data: {
        campaignId,
        userId,
        videoId,
        duration: 0, // Sera mis à jour quand la vidéo est vue
        engaged: false
      }
    });

    // Incrémenter viewsDelivered
    await prisma.boostCampaign.update({
      where: { id: campaignId },
      data: {
        viewsDelivered: { increment: 1 }
      }
    });

    // Vérifier si la campagne est terminée
    const campaign = await prisma.boostCampaign.findUnique({
      where: { id: campaignId }
    });

    if (campaign && campaign.viewsDelivered >= campaign.viewsPromised) {
      await this.completeCampaign(campaignId);
    }
  }

  // Terminer une campagne
  static async completeCampaign(campaignId: string) {
    const campaign = await prisma.boostCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'completed',
        completedAt: new Date()
      },
      include: {
        video: true
      }
    });

    // Unmarker la vidéo comme boostée
    await prisma.video.update({
      where: { id: campaign.videoId },
      data: { isBoosted: false }
    });

    // Notification
    await prisma.notification.create({
      data: {
        userId: campaign.userId,
        type: 'boost_completed',
        title: '✅ Boost terminé',
        message: `Votre campagne boost a livré ${campaign.viewsDelivered.toLocaleString()} vues !`
      }
    });

    return campaign;
  }

  // Analytics d'une campagne
  static async getCampaignAnalytics(campaignId: string, userId: string) {
    const campaign = await prisma.boostCampaign.findUnique({
      where: { id: campaignId },
      include: {
        video: true,
        impressions: {
          select: {
            duration: true,
            engaged: true,
            viewedAt: true
          }
        }
      }
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // Calculer les stats
    const totalImpressions = campaign.impressions.length;
    const avgDuration = campaign.impressions.reduce((sum, i) => sum + i.duration, 0) / totalImpressions || 0;
    const engagementRate = (campaign.impressions.filter(i => i.engaged).length / totalImpressions) * 100 || 0;

    // Progression
    const progress = (campaign.viewsDelivered / campaign.viewsPromised) * 100;

    // Temps restant
    const hoursElapsed = (Date.now() - campaign.startedAt.getTime()) / (1000 * 60 * 60);
    const hoursRemaining = Math.max(0, 48 - hoursElapsed);

    return {
      campaign,
      stats: {
        viewsDelivered: campaign.viewsDelivered,
        viewsPromised: campaign.viewsPromised,
        progress: Math.min(100, progress),
        totalImpressions,
        avgDuration: Math.round(avgDuration),
        engagementRate: engagementRate.toFixed(2),
        hoursRemaining: Math.round(hoursRemaining),
        status: campaign.status
      }
    };
  }

  // Campagnes d'un user
  static async getUserCampaigns(userId: string, limit: number = 20) {
    const campaigns = await prisma.boostCampaign.findMany({
      where: { userId },
      include: {
        video: {
          select: {
            id: true,
            videoUrl: true,
            thumbnailUrl: true,
            title: true,
            views: true
          }
        }
      },
      orderBy: { startedAt: 'desc' },
      take: limit
    });

    return campaigns;
  }

  // Campagnes actives (pour distribution)
static async getActiveCampaigns() {
  const campaigns = await prisma.boostCampaign.findMany({
    where: {
      status: 'active'
    },
    include: {
      video: true
    }
  });

  // Filtrer celles qui n'ont pas atteint leur objectif
  return campaigns.filter(c => c.viewsDelivered < c.viewsPromised);
}

  // Stats globales (Admin)
  static async getGlobalStats(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await prisma.boostCampaign.aggregate({
      where: {
        startedAt: { gte: startDate }
      },
      _sum: {
        price: true,
        viewsDelivered: true
      },
      _count: {
        id: true
      }
    });

    const byPackage = await prisma.boostCampaign.groupBy({
      by: ['package'],
      where: {
        startedAt: { gte: startDate }
      },
      _count: true,
      _sum: {
        price: true
      }
    });

    return {
      period: { days, from: startDate, to: new Date() },
      total: {
        campaigns: stats._count.id,
        revenue: stats._sum.price || 0,
        viewsDelivered: stats._sum.viewsDelivered || 0
      },
      byPackage
    };
  }

  // Webhook Stripe (pour confirmer paiements)
  static async handleStripeWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { userId, videoId, packageId } = paymentIntent.metadata;

        if (userId && videoId && packageId) {
          await this.createBoostCampaign(userId, videoId, packageId, paymentIntent.id);
        }
        break;

      case 'payment_intent.payment_failed':
        // Logger l'échec
        console.error('Payment failed:', event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }
}
import { Request, Response } from 'express';
import { BoostService } from '../services/boost.service';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

export class BoostController {
  // GET /api/boost/packages - Liste des packages
  static async getPackages(req: Request, res: Response) {
    try {
      const packages = BoostService.getPackages();

      return res.status(200).json({ packages });
    } catch (error) {
      console.error('Get packages error:', error);
      return res.status(500).json({
        error: 'Failed to get packages'
      });
    }
  }

  // POST /api/boost/create-payment-intent - Créer payment intent
  static async createPaymentIntent(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const { videoId, packageId } = req.body;

      if (!videoId || !packageId) {
        return res.status(400).json({
          error: 'Video ID and package ID are required'
        });
      }

      const result = await BoostService.createPaymentIntent(userId, videoId, packageId);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Invalid package') {
          return res.status(400).json({ error: 'Invalid package' });
        }
        if (error.message === 'Video not found') {
          return res.status(404).json({ error: 'Video not found' });
        }
        if (error.message === 'Unauthorized') {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        if (error.message === 'Video already boosted') {
          return res.status(409).json({ error: 'Video already boosted' });
        }
      }
      console.error('Create payment intent error:', error);
      return res.status(500).json({
        error: 'Failed to create payment intent'
      });
    }
  }

  // POST /api/boost/confirm - Confirmer paiement et créer campagne
  static async confirmBoost(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const { videoId, packageId, paymentIntentId } = req.body;

      if (!videoId || !packageId || !paymentIntentId) {
        return res.status(400).json({
          error: 'Missing required fields'
        });
      }

      const campaign = await BoostService.createBoostCampaign(
        userId,
        videoId,
        packageId,
        paymentIntentId
      );

      return res.status(201).json({
        message: 'Boost campaign created',
        campaign
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Payment not completed') {
          return res.status(400).json({ error: 'Payment not completed' });
        }
        if (error.message === 'Invalid package') {
          return res.status(400).json({ error: 'Invalid package' });
        }
      }
      console.error('Confirm boost error:', error);
      return res.status(500).json({
        error: 'Failed to create boost campaign'
      });
    }
  }

  // GET /api/boost/campaigns - Mes campagnes
  static async getMyCampaigns(req: Request, res: Response) {
    try {
      const userId = req.userId!;
      const limit = parseInt(req.query.limit as string) || 20;

      const campaigns = await BoostService.getUserCampaigns(userId, limit);

      return res.status(200).json({ campaigns });
    } catch (error) {
      console.error('Get campaigns error:', error);
      return res.status(500).json({
        error: 'Failed to get campaigns'
      });
    }
  }

  // GET /api/boost/campaigns/:id/analytics - Analytics campagne
  static async getCampaignAnalytics(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const analytics = await BoostService.getCampaignAnalytics(id, userId);

      return res.status(200).json(analytics);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Campaign not found') {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        if (error.message === 'Unauthorized') {
          return res.status(403).json({ error: 'Unauthorized' });
        }
      }
      console.error('Get analytics error:', error);
      return res.status(500).json({
        error: 'Failed to get analytics'
      });
    }
  }

  // POST /api/boost/webhook - Stripe webhook
  static async stripeWebhook(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );

      await BoostService.handleStripeWebhook(event);

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(400).json({
        error: 'Webhook signature verification failed'
      });
    }
  }

  // GET /api/boost/admin/stats - Stats globales (ADMIN)
  static async getGlobalStats(req: Request, res: Response) {
    try {
      // TODO: Ajouter vérification admin

      const days = parseInt(req.query.days as string) || 30;

      const stats = await BoostService.getGlobalStats(days);

      return res.status(200).json(stats);
    } catch (error) {
      console.error('Get global stats error:', error);
      return res.status(500).json({
        error: 'Failed to get stats'
      });
    }
  }
}
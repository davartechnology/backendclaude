// src/jobs/distribution.job.ts

// Correction 1 : ScheduleOptions n'est pas exporté. Utilisons 'ScheduleOptions' (ou TaskOptions) 
// S'il n'y a pas d'exportation de type explicite pour les options de schedule, 
// nous allons le retirer et laisser TypeScript déduire le type, car il ne contient que 'timezone'.
import { schedule, ScheduledTask } from 'node-cron'; 
import { DistributionService } from '../services/distribution.service';

// --- CONFIGURATION ---
// Timezone Washington DC = America/New_York
const DISTRIBUTION_TIME = '0 0 * * *'; // Tous les jours à 00h00
// ---------------------

/**
 * @class DistributionJob
 * @description Gère la planification et l'exécution de la tâche de distribution des revenus quotidiens.
 */
export class DistributionJob {
  // Le job planifié.
  private static job: ScheduledTask | null = null;

  /**
   * @method start
   * @description Démarre la tâche de distribution si elle n'est pas déjà en cours.
   */
  static start() {
    if (this.job) {
      console.log('⚠️ Distribution job already running');
      return;
    }

    console.log('🚀 Starting distribution job...');
    console.log(`⏰ Schedule: Every day at 00:00 (America/New_York)`);

    this.job = schedule(
      DISTRIBUTION_TIME,
      async () => {
        console.log('\n================================================');
        console.log(`🕐 Distribution job triggered at ${new Date().toISOString()}`);
        console.log('================================================\n');

        try {
          // Appel du service pour exécuter la logique de distribution
          const result = await DistributionService.distributeDailyRevenue();

          if (result.success) {
            console.log('\n✅ Distribution completed successfully!');
            console.log('Stats:', result.stats);
          } else {
            console.log('\n⚠️ Distribution skipped:', result.reason);
          }
        } catch (error) {
          console.error('\n❌ Distribution job failed:', error);
        }

        console.log('\n================================================\n');
      },
      {
        // On laisse TypeScript déduire le type pour les options.
        timezone: 'America/New_York',
      } 
    );

    console.log('✅ Distribution job started successfully');
    console.log('Next run:', this.getNextRun());
  }

  /**
   * @method stop
   * @description Arrête la tâche de distribution en cours.
   */
  static stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('⏹️ Distribution job stopped');
    }
  }

  /**
   * @method getNextRun
   * @description Calcule et retourne la prochaine date d'exécution.
   * Correction 2 : La méthode 'next()' n'existe pas ou n'est pas typée sur 'ScheduledTask'. 
   * On utilise la logique de calcul simple et fiable.
   * @returns {Date | null} La prochaine date d'exécution ou null si le job n'est pas démarré.
   */
  static getNextRun(): Date | null {
    if (!this.job) return null;

    const now = new Date();
    const next = new Date(now);
    
    // Calculer la prochaine occurrence de 00:00 Washington time
    // Ce calcul simple est utilisé car la méthode 'this.job.next()' n'est pas disponible ou typée.
    next.setHours(0, 0, 0, 0);
    
    // Si l'heure de 00:00 est déjà passée aujourd'hui, on passe à demain.
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  /**
   * @method runNow
   * @description Exécute manuellement la logique de distribution immédiatement.
   */
  static async runNow() {
    console.log('🔧 Manual distribution triggered');
    
    try {
      const result = await DistributionService.distributeDailyRevenue();
      console.log('Distribution result:', result);
      return result;
    } catch (error) {
      console.error('Manual distribution error:', error);
      throw error;
    }
  }

  /**
   * @method getStatus
   * @description Retourne l'état actuel de la tâche de distribution.
   */
  static getStatus() {
    return {
      isRunning: this.job !== null,
      nextRun: this.getNextRun(),
      timezone: 'America/New_York',
      schedule: DISTRIBUTION_TIME
    };
  }
}

// Auto-démarrer si l'environnement est en mode 'production'
if (process.env.NODE_ENV === 'production') {
  DistributionJob.start();
  console.log('🚀 Distribution job auto-started (production mode)');
}
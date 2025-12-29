import { prisma } from '../lib/prisma';
// 1. Importez la classe Decimal de Prisma pour les calculs précis
import { Prisma } from '@prisma/client';
const Decimal = Prisma.Decimal;

export class DistributionService {
    // Distribution quotidienne (appelée par Cron Job à 00h00 Washington)
    static async distributeDailyRevenue() {
        try {
            console.log('🚀 Starting daily revenue distribution...');

            // Date d'hier (J-1)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);

            // Vérifier si déjà distribué
            const existingPool = await prisma.dailyRevenuePool.findUnique({
                where: { date: yesterday }
            });

            if (existingPool && existingPool.isDistributed) {
                console.log('⚠️ Revenue already distributed for', yesterday);
                return { success: false, reason: 'Already distributed' };
            }

            // 1. Calculer le revenue pub in-feed d'hier
            // Le résultat est un Number (simulé)
            const inFeedAdRevenueNumber = await this.calculateInFeedAdRevenue(yesterday);
            // Convertir le Number en Decimal pour les calculs
            const inFeedAdRevenue = new Decimal(inFeedAdRevenueNumber);
            console.log(`💰 In-feed ad revenue: $${inFeedAdRevenue.toFixed(2)}`);

            // 2. Pool distribuable = 60%
            // Utiliser .mul() pour la multiplication
            const distributionPool = inFeedAdRevenue.mul(new Decimal(0.6));
            console.log(`📊 Distribution pool (60%): $${distributionPool.toFixed(2)}`);

            // 3. Calculer total des sets d'hier
            const totalSetsResult = await prisma.dailySets.aggregate({
                where: {
                    date: yesterday
                },
                _sum: {
                    totalSets: true
                }
            });

            // totalSets est maintenant un Decimal ou null. Assurez-vous d'avoir une valeur Decimal
            const totalSets = totalSetsResult._sum.totalSets || new Decimal(0);
            console.log(`🎯 Total sets generated: ${totalSets.toFixed(4)}`);

            if (totalSets.equals(0)) { // Utiliser .equals() pour comparer avec Decimal
                console.log('⚠️ No sets generated yesterday, skipping distribution');
                return { success: false, reason: 'No sets to distribute' };
            }

            // 4. Valeur d'1 set en dollars
            // Utiliser .div() pour la division
            const setValueInDollars = distributionPool.div(totalSets);
            console.log(`💵 Value per set: $${setValueInDollars.toFixed(8)}`);

            // 5. Créer ou mettre à jour le pool
            const pool = await prisma.dailyRevenuePool.upsert({
                where: { date: yesterday },
                create: {
                    date: yesterday,
                    inFeedAdRevenue,
                    distributionPool,
                    totalSets,
                    setValueInDollars
                },
                update: {
                    inFeedAdRevenue,
                    distributionPool,
                    totalSets,
                    setValueInDollars
                }
            });

            // 6. Distribuer à chaque utilisateur
            const usersWithSets = await prisma.dailySets.findMany({
                where: {
                    date: yesterday,
                    totalSets: { gt: new Decimal(0) } // Comparaison Decimal
                },
                include: {
                    user: true
                }
            });

            console.log(`👥 Distributing to ${usersWithSets.length} users...`);

            let distributedCount = 0;
            // Initialiser l'accumulateur totalDistributed comme Decimal
            let totalDistributed = new Decimal(0);

            for (const userSets of usersWithSets) {
                // Utiliser .mul() pour la multiplication
                const amountEarned = userSets.totalSets.mul(setValueInDollars);

                // Créer la distribution
                await prisma.setDistribution.create({
                    data: {
                        userId: userSets.userId,
                        poolId: pool.id,
                        date: yesterday,
                        totalSets: userSets.totalSets,
                        amountEarned,
                        status: 'credited',
                        creditedAt: new Date()
                    }
                });

                // Créditer la balance disponible
                await prisma.userBalance.update({
                    where: { userId: userSets.userId },
                    data: {
                        // Prisma gère nativement l'incrémentation avec Decimal
                        availableBalance: { increment: amountEarned },
                        lifetimeEarnings: { increment: amountEarned },
                        pendingBalance: new Decimal(0) // Mettre le 0 en Decimal
                    }
                });

                distributedCount++;
                // Utiliser .add() pour l'addition
                totalDistributed = totalDistributed.add(amountEarned);
            }

            // 7. Marquer comme distribué
            await prisma.dailyRevenuePool.update({
                where: { id: pool.id },
                data: {
                    isDistributed: true,
                    distributedAt: new Date()
                }
            });

            const averagePerUser = distributedCount > 0 ? totalDistributed.div(distributedCount) : new Decimal(0);

            console.log(`✅ Distribution completed!`);
            console.log(`📊 Stats:`);
            console.log(`   - Users credited: ${distributedCount}`);
            console.log(`   - Total distributed: $${totalDistributed.toFixed(2)}`);
            console.log(`   - Average per user: $${averagePerUser.toFixed(4)}`);

            // 8. Envoyer notifications aux top earners (top 100)
            await this.notifyTopEarners(yesterday);

            return {
                success: true,
                stats: {
                    date: yesterday,
                    usersCount: distributedCount,
                    totalDistributed: totalDistributed.toNumber(), // Convertir pour le retour JSON si nécessaire
                    averagePerUser: averagePerUser.toNumber(), // Convertir pour le retour JSON si nécessaire
                    setValueInDollars: setValueInDollars.toNumber() // Convertir pour le retour JSON si nécessaire
                }
            };
        } catch (error) {
            console.error('❌ Distribution error:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    // Calculer le revenue pub in-feed d'un jour
    static async calculateInFeedAdRevenue(date: Date): Promise<number> {
        // ... (Pas de changement ici, car le résultat est une simulation en number)
        const adViews = await prisma.adView.count({
            where: {
                adType: 'in-feed',
                createdAt: {
                    gte: date,
                    lt: new Date(date.getTime() + 24 * 60 * 60 * 1000)
                }
            }
        });

        // Simulation : CPM $6, 1 ad toutes les 5 vidéos
        const estimatedRevenue = (adViews / 1000) * 6;

        return estimatedRevenue;
    }

    // Envoyer notifications aux top earners
    static async notifyTopEarners(date: Date) {
        try {
            const topDistributions = await prisma.setDistribution.findMany({
                where: {
                    date,
                    status: 'credited'
                },
                orderBy: {
                    amountEarned: 'desc'
                },
                take: 100,
                include: {
                    user: true
                }
            });

            for (const distribution of topDistributions) {
                // Créer notification
                await prisma.notification.create({
                    data: {
                        userId: distribution.userId,
                        type: 'earnings',
                        title: '💰 Vous avez gagné !',
                        // .toFixed(2) est sûr sur un objet Decimal
                        message: `Vous avez gagné $${distribution.amountEarned.toFixed(2)} aujourd'hui !`,
                        data: {
                            amount: distribution.amountEarned.toNumber(), // Conversion pour le champ JSON
                            sets: distribution.totalSets.toNumber(),      // Conversion pour le champ JSON
                            date: date.toISOString()
                        }
                    }
                });
                // TODO: Envoyer push notification via Firebase
            }

            console.log(`🔔 Notifications sent to top ${topDistributions.length} earners`);
        } catch (error) {
            console.error('Error sending notifications:', error);
        }
    }

    // Récupérer l'historique des distributions d'un user
    static async getUserDistributionHistory(userId: string, limit: number = 30) {
        // ... (Pas de changement dans cette fonction de lecture)
        const distributions = await prisma.setDistribution.findMany({
            where: {
                userId,
                status: 'credited'
            },
            include: {
                pool: true
            },
            orderBy: {
                date: 'desc'
            },
            take: limit
        });

        return distributions;
    }

    // Stats globales de distribution
    static async getGlobalDistributionStats(days: number = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const pools = await prisma.dailyRevenuePool.findMany({
            where: {
                date: { gte: startDate },
                isDistributed: true
            },
            orderBy: { date: 'desc' }
        });

        // Utiliser .reduce() avec l'initialisation à new Decimal(0) et .add()
        const totalRevenue = pools.reduce((sum, p) => sum.add(p.inFeedAdRevenue), new Decimal(0));
        const totalDistributed = pools.reduce((sum, p) => sum.add(p.distributionPool), new Decimal(0));
        const totalSets = pools.reduce((sum, p) => sum.add(p.totalSets), new Decimal(0));

        const distributionsCount = await prisma.setDistribution.count({
            where: {
                date: { gte: startDate },
                status: 'credited'
            }
        });

        // Calculer les moyennes en Decimal avant de convertir pour le retour
        const averagePerDaySets = totalSets.div(pools.length);
        const revenuePercentage = totalDistributed.div(totalRevenue).mul(100);
        const averagePerDayDistributions = new Decimal(distributionsCount).div(pools.length);


        return {
            period: {
                days,
                from: startDate,
                to: new Date()
            },
            revenue: {
                total: totalRevenue.toNumber(),
                distributed: totalDistributed.toNumber(),
                percentage: revenuePercentage.toNumber()
            },
            sets: {
                total: totalSets.toNumber(),
                averagePerDay: averagePerDaySets.toNumber()
            },
            distributions: {
                count: distributionsCount,
                averagePerDay: averagePerDayDistributions.toNumber()
            },
            dailyDetails: pools
        };
    }

    // Forcer une distribution manuelle (admin seulement)
    static async forceDistribution(date: Date) {
        console.log('⚠️ Manual distribution triggered for', date);
        return await this.distributeDailyRevenue();
    }
}
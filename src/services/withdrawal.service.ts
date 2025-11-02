import { prisma } from '../server';
import { Prisma } from '@prisma/client';

// Initialiser la classe Decimal
const Decimal = Prisma.Decimal;

// Configuration des méthodes de retrait
// J'ai converti les frais en Decimal pour les calculs internes
const WITHDRAWAL_METHODS = {
    paypal: {
        minAmount: 3,
        fee: new Decimal(0.30),
        processingTime: '2-5 jours'
    },
    mobile: {
        minAmount: 5,
        fee: new Decimal(0.50),
        processingTime: 'Instantané'
    },
    bank: {
        minAmount: 100,
        fee: new Decimal(2),
        processingTime: '5-10 jours'
    },
    western_union: {
        minAmount: 50,
        fee: new Decimal(5),
        processingTime: '1-3 jours'
    }
};

interface WithdrawalRequest {
    userId: string;
    // Accepte number ou Decimal en entrée
    amount: number | Prisma.Decimal; 
    method: 'paypal' | 'mobile' | 'bank' | 'western_union';
    paymentDetails: {
        paypalEmail?: string;
        phoneNumber?: string;
        bankDetails?: {
            iban?: string;
            swift?: string;
            accountName?: string;
            bankName?: string;
        };
        westernUnionDetails?: {
            firstName?: string;
            lastName?: string;
            country?: string;
            city?: string;
        };
    };
}

export class WithdrawalService {
    // Créer une demande de retrait
    static async createWithdrawal(data: WithdrawalRequest) {
        const { userId, amount, method, paymentDetails } = data;

        // Convertir le montant d'entrée en Decimal pour tous les calculs
        const requestAmount = new Decimal(amount);

        // 1. Vérifier que la méthode existe
        const methodConfig = WITHDRAWAL_METHODS[method];
        if (!methodConfig) {
            throw new Error('Invalid withdrawal method');
        }

        // 2. Vérifier le montant minimum (comparaison standard avec .toNumber())
        if (requestAmount.toNumber() < methodConfig.minAmount) {
            throw new Error(`Minimum amount for ${method} is $${methodConfig.minAmount}`);
        }

        // 3. Récupérer la balance de l'utilisateur
        const balance = await prisma.userBalance.findUnique({
            where: { userId }
        });

        if (!balance) {
            throw new Error('User balance not found');
        }

        // 4. Vérifier les fonds disponibles (montant + frais)
        // Correction : Utiliser .add() pour l'addition
        const totalRequired = requestAmount.add(methodConfig.fee); 
        
        // Correction : Utiliser .lessThan() pour la comparaison
        if (balance.availableBalance.lessThan(totalRequired)) { 
            throw new Error(`Insufficient balance. Required: $${totalRequired.toFixed(2)}, Available: $${balance.availableBalance.toFixed(2)}`);
        }

        // 5. Vérifier le dernier retrait (pas de changement dans cette logique)
        if (balance.lastWithdrawal) {
            const daysSinceLastWithdrawal = Math.floor(
                (Date.now() - balance.lastWithdrawal.getTime()) / (1000 * 60 * 60 * 24)
            );
            
            if (daysSinceLastWithdrawal < 30) {
                const daysRemaining = 30 - daysSinceLastWithdrawal;
                throw new Error(`You can only withdraw once per month. Wait ${daysRemaining} more days.`);
            }
        }

        // 6. Vérifier l'email vérifié (pas de changement)
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            throw new Error('User not found');
        }

        // 7. Vérifier les détails de paiement (pas de changement)
        this.validatePaymentDetails(method, paymentDetails);

        // 8. Créer la demande de retrait
        // Correction : Utiliser .sub() pour la soustraction
        const netAmount = requestAmount.sub(methodConfig.fee); 

        const withdrawal = await prisma.withdrawalRequest.create({
            data: {
                userId,
                amount: requestAmount,
                method,
                paypalEmail: paymentDetails.paypalEmail || null,
                phoneNumber: paymentDetails.phoneNumber || null,
                // Assurez-vous que l'objet est stockable (pas de changement de la logique de sérialisation JSON.parse/stringify)
                bankDetails: paymentDetails.bankDetails ? JSON.parse(JSON.stringify(paymentDetails.bankDetails)) : null,
                westernUnionDetails: paymentDetails.westernUnionDetails ? JSON.parse(JSON.stringify(paymentDetails.westernUnionDetails)) : null,
                fee: methodConfig.fee, // Est déjà un Decimal
                netAmount: netAmount,  // Est déjà un Decimal
                status: 'pending',
                requestedAt: new Date()
            }
        });

        // 9. Débiter la balance (freeze)
        await prisma.userBalance.update({
            where: { userId },
            data: {
                // TotalRequired est la somme (montant + frais)
                availableBalance: { decrement: totalRequired } 
            }
        });

        // 10. Créer notification
        await prisma.notification.create({
            data: {
                userId,
                type: 'withdrawal_requested',
                title: '💳 Demande de retrait',
                // Utiliser .toFixed(2) sur la valeur Decimal
                message: `Votre demande de retrait de $${requestAmount.toFixed(2)} est en cours de traitement.` 
            }
        });

        return {
            withdrawal,
            estimatedProcessingTime: methodConfig.processingTime
        };
    }

    // Valider les détails de paiement (pas de changement)
    static validatePaymentDetails(method: string, details: any) {
        switch (method) {
            case 'paypal':
                if (!details.paypalEmail || !this.isValidEmail(details.paypalEmail)) {
                    throw new Error('Valid PayPal email is required');
                }
                break;
            
            case 'mobile':
                if (!details.phoneNumber || !this.isValidPhone(details.phoneNumber)) {
                    throw new Error('Valid phone number is required');
                }
                break;
            
            case 'bank':
                if (!details.bankDetails?.iban || !details.bankDetails?.accountName) {
                    throw new Error('IBAN and account name are required');
                }
                break;
            
            case 'western_union':
                if (!details.westernUnionDetails?.firstName || !details.westernUnionDetails?.lastName) {
                    throw new Error('First name and last name are required');
                }
                break;
            
            default:
                throw new Error('Invalid payment method');
        }
    }

    // Valider email (pas de changement)
    static isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Valider téléphone (pas de changement)
    static isValidPhone(phone: string): boolean {
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }

    // Récupérer les demandes de retrait d'un user (pas de changement)
    static async getUserWithdrawals(userId: string, limit: number = 50) {
        const withdrawals = await prisma.withdrawalRequest.findMany({
            where: { userId },
            orderBy: { requestedAt: 'desc' },
            take: limit
        });

        return withdrawals;
    }

    // Récupérer une demande par ID (pas de changement)
    static async getWithdrawalById(id: string, userId: string) {
        const withdrawal = await prisma.withdrawalRequest.findUnique({
            where: { id }
        });

        if (!withdrawal) {
            throw new Error('Withdrawal not found');
        }

        // Vérifier que ça appartient bien à l'user
        if (withdrawal.userId !== userId) {
            throw new Error('Unauthorized');
        }

        return withdrawal;
    }

    // Approuver un retrait (ADMIN) (pas de changement)
    static async approveWithdrawal(id: string) {
        const withdrawal = await prisma.withdrawalRequest.findUnique({
            where: { id }
        });

        if (!withdrawal) {
            throw new Error('Withdrawal not found');
        }

        if (withdrawal.status !== 'pending') {
            throw new Error('Withdrawal already processed');
        }

        // Mettre à jour le statut
        await prisma.withdrawalRequest.update({
            where: { id },
            data: {
                status: 'processing',
                processedAt: new Date()
            }
        });

        // TODO: Intégrer API PayPal/Stripe/etc. pour le paiement réel

        // Simuler le traitement
        await prisma.withdrawalRequest.update({
            where: { id },
            data: {
                status: 'completed',
                completedAt: new Date(),
                transactionId: `TXN_${Date.now()}`
            }
        });

        // Mettre à jour lastWithdrawal
        await prisma.userBalance.update({
            where: { userId: withdrawal.userId },
            data: {
                lastWithdrawal: new Date(),
                // amount est un Decimal, l'incrémentation est correcte
                totalWithdrawn: { increment: withdrawal.amount } 
            }
        });

        // Notification
        await prisma.notification.create({
            data: {
                userId: withdrawal.userId,
                type: 'withdrawal_completed',
                title: '✅ Retrait complété',
                // amount est un Decimal, .toFixed(2) est correct
                message: `Votre retrait de $${withdrawal.amount.toFixed(2)} a été effectué avec succès !`
            }
        });

        return { message: 'Withdrawal approved and completed' };
    }

    // Rejeter un retrait (ADMIN)
    static async rejectWithdrawal(id: string, reason: string) {
        const withdrawal = await prisma.withdrawalRequest.findUnique({
            where: { id }
        });

        if (!withdrawal) {
            throw new Error('Withdrawal not found');
        }

        if (withdrawal.status !== 'pending') {
            throw new Error('Withdrawal already processed');
        }

        // Mettre à jour le statut
        await prisma.withdrawalRequest.update({
            where: { id },
            data: {
                status: 'rejected',
                rejectionReason: reason,
                processedAt: new Date()
            }
        });

        // Re-créditer la balance
        // Correction : Utiliser .add() pour l'addition
        const totalAmount = withdrawal.amount.add(withdrawal.fee); 
        await prisma.userBalance.update({
            where: { userId: withdrawal.userId },
            data: {
                // totalAmount est un Decimal, l'incrémentation est correcte
                availableBalance: { increment: totalAmount } 
            }
        });

        // Notification
        await prisma.notification.create({
            data: {
                userId: withdrawal.userId,
                type: 'withdrawal_rejected',
                title: '❌ Retrait refusé',
                message: `Votre demande de retrait a été refusée. Raison : ${reason}`
            }
        });

        return { message: 'Withdrawal rejected' };
    }

    // Récupérer toutes les demandes en attente (ADMIN) (pas de changement)
    static async getPendingWithdrawals(limit: number = 100) {
        const withdrawals = await prisma.withdrawalRequest.findMany({
            where: { status: 'pending' },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            },
            orderBy: { requestedAt: 'asc' },
            take: limit
        });

        return withdrawals;
    }

    // Stats des retraits (ADMIN)
    static async getWithdrawalStats(days: number = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Agrégation globale
        const stats = await prisma.withdrawalRequest.aggregate({
            where: {
                requestedAt: { gte: startDate }
            },
            _sum: {
                amount: true,
                fee: true
            },
            _count: {
                id: true
            }
        });

        // Agrégation par statut
        const byStatus = await prisma.withdrawalRequest.groupBy({
            by: ['status'],
            where: {
                requestedAt: { gte: startDate }
            },
            _count: {
                id: true
            },
            _sum: {
                amount: true,
                fee: true // <-- CORRECTION: Ajoutez 'fee' ici pour qu'il soit disponible dans le reduce
            }
        });
        
        // Les Decimals sont déjà disponibles grâce à l'agrégation globale 'stats'
        const totalAmount = stats._sum.amount || new Decimal(0);
        const totalFees = stats._sum.fee || new Decimal(0);


        return {
            period: { days, from: startDate, to: new Date() },
            total: {
                count: stats._count.id,
                // Convertir les totaux en string ou en number pour le retour JSON
                amount: totalAmount.toString(), 
                fees: totalFees.toString() 
            },
            byStatus: byStatus.map(s => ({ 
                // Nous retournons les Decimals convertis en nombre pour les statistiques
                status: s.status, 
                count: s._count.id,
                amount: s._sum.amount?.toString() || '0',
                fee: s._sum.fee?.toString() || '0'
            }))
        };
    }
}

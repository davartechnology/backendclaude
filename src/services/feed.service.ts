import { prisma } from '../server';

interface VideoScore {
  videoId: string;
  score: number;
  reason: string;
}

export class FeedService {
  // Feed "Pour Toi" - Algorithme de recommandation
  static async getForYouFeed(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // 1. Récupérer les préférences de l'user
    const userPreferences = await this.getUserPreferences(userId);

    // 2. Récupérer les vidéos candidates (pas vues récemment)
    const recentViewedIds = await this.getRecentlyViewedVideos(userId, 100);
    
    const candidateVideos = await prisma.video.findMany({
      where: {
        isDeleted: false,
        isPublic: true,
        id: {
          notIn: recentViewedIds
        },
        // Exclure ses propres vidéos
        userId: {
          not: userId
        }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            isVerified: true,
            followersCount: true
          }
        },
        hashtags: {
          include: {
            hashtag: true
          }
        },
        sound: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            favorites: true
          }
        }
      },
      take: 500, // Pool de 500 vidéos candidates
      orderBy: {
        createdAt: 'desc'
      }
    });

    // 3. Scorer chaque vidéo
    const scoredVideos = candidateVideos.map(video => {
      const score = this.calculateVideoScore(video, userPreferences);
      return {
        video,
        score: score.totalScore,
        breakdown: score.breakdown
      };
    });

    // 4. Trier par score décroissant
    scoredVideos.sort((a, b) => b.score - a.score);

    // 5. Mix 70% découverte + 30% following
    const followingVideos = await this.getFollowingFeed(userId, Math.ceil(limit * 0.3));
    const discoveryVideos = scoredVideos.slice(0, Math.ceil(limit * 0.7));

    // 6. Mélanger intelligemment
    const finalFeed = this.mixVideos(discoveryVideos, followingVideos, limit);

    // 7. Paginer
    const paginatedFeed = finalFeed.slice(skip, skip + limit);

    return {
      videos: paginatedFeed.map(item => item.video),
      pagination: {
        page,
        limit,
        hasMore: finalFeed.length > skip + limit
      }
    };
  }

  // Feed "Abonnements" - Vidéos des comptes suivis
  static async getFollowingFeed(userId: string, limit: number = 20) {
    // Récupérer les IDs des comptes suivis
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true }
    });

    const followingIds = following.map(f => f.followingId);

    if (followingIds.length === 0) {
      return [];
    }

    const videos = await prisma.video.findMany({
      where: {
        userId: { in: followingIds },
        isDeleted: false,
        isPublic: true
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            isVerified: true,
            followersCount: true
          }
        },
        hashtags: {
          include: {
            hashtag: true
          }
        },
        sound: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            favorites: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });

    return videos.map(video => ({
      video,
      score: 0,
      breakdown: {}
    }));
  }

  // Feed "Trending" - Vidéos populaires
  static async getTrendingFeed(limit: number = 20) {
    // Vidéos des dernières 48h avec le plus d'engagement
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const videos = await prisma.video.findMany({
      where: {
        createdAt: { gte: twoDaysAgo },
        isDeleted: false,
        isPublic: true
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            isVerified: true,
            followersCount: true
          }
        },
        hashtags: {
          include: {
            hashtag: true
          }
        },
        sound: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            favorites: true
          }
        }
      },
      orderBy: [
        { likesCount: 'desc' },
        { views: 'desc' }
      ],
      take: limit
    });

    return videos;
  }

  // Calculer le score d'une vidéo pour un user
  static calculateVideoScore(video: any, userPreferences: any): { totalScore: number; breakdown: any } {
    let score = 0;
    const breakdown: any = {};

    // 1. Score d'engagement (40% du poids)
    const engagementRate = (video._count.likes + video._count.comments * 2 + video._count.favorites) / Math.max(video.views, 1);
    const engagementScore = Math.min(engagementRate * 100, 40);
    score += engagementScore;
    breakdown.engagement = engagementScore;

    // 2. Score de récence (20% du poids)
    const hoursSinceCreation = (Date.now() - video.createdAt.getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(20 - (hoursSinceCreation / 24) * 2, 0);
    score += recencyScore;
    breakdown.recency = recencyScore;

    // 3. Score de popularité du créateur (10% du poids)
    const creatorScore = Math.min((video.user.followersCount / 1000) * 10, 10);
    score += creatorScore;
    breakdown.creator = creatorScore;

    // 4. Score de similarité hashtags (15% du poids)
    if (userPreferences.favoriteHashtags.length > 0) {
      const videoHashtags = video.hashtags.map((h: any) => h.hashtag.name);
      const commonHashtags = videoHashtags.filter((h: string) => userPreferences.favoriteHashtags.includes(h));
      const hashtagScore = (commonHashtags.length / Math.max(videoHashtags.length, 1)) * 15;
      score += hashtagScore;
      breakdown.hashtags = hashtagScore;
    }

    // 5. Score de son (5% du poids)
    if (video.soundId && userPreferences.favoriteSounds.includes(video.soundId)) {
      score += 5;
      breakdown.sound = 5;
    }

    // 6. Vidéo boostée (bonus)
    if (video.isBoosted) {
      score += 10;
      breakdown.boosted = 10;
    }

    // 7. Compte vérifié (bonus)
    if (video.user.isVerified) {
      score += 5;
      breakdown.verified = 5;
    }

    return {
      totalScore: score,
      breakdown
    };
  }

  // Récupérer les préférences d'un user
  static async getUserPreferences(userId: string) {
    // Hashtags des vidéos likées
    const likedVideos = await prisma.like.findMany({
      where: { userId },
      include: {
        video: {
          include: {
            hashtags: {
              include: {
                hashtag: true
              }
            }
          }
        }
      },
      take: 50,
      orderBy: { createdAt: 'desc' }
    });

    const favoriteHashtags = likedVideos
      .flatMap(like => like.video.hashtags.map(h => h.hashtag.name))
      .reduce((acc: any, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      }, {});

    const topHashtags = Object.entries(favoriteHashtags)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 10)
      .map(([tag]) => tag);

    // Sons des vidéos likées
    const favoriteSounds = likedVideos
      .map(like => like.video.soundId)
      .filter(Boolean) as string[];

    return {
      favoriteHashtags: topHashtags,
      favoriteSounds: [...new Set(favoriteSounds)]
    };
  }

  // Récupérer les vidéos vues récemment
  static async getRecentlyViewedVideos(userId: string, limit: number = 100): Promise<string[]> {
    // On suppose que vous trackez les vues dans ActivityLog
    const recentViews = await prisma.activityLog.findMany({
      where: {
        userId,
        actionType: 'view'
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: { targetId: true }
    });

    return recentViews.map(v => v.targetId).filter(Boolean) as string[];
  }

  // Mélanger découverte et following
  static mixVideos(discovery: any[], following: any[], limit: number) {
    const mixed: any[] = [];
    let dIndex = 0;
    let fIndex = 0;

    for (let i = 0; i < limit; i++) {
      // Alterner : 2 découverte, 1 following
      if (i % 3 === 2 && fIndex < following.length) {
        mixed.push(following[fIndex++]);
      } else if (dIndex < discovery.length) {
        mixed.push(discovery[dIndex++]);
      } else if (fIndex < following.length) {
        mixed.push(following[fIndex++]);
      }
    }

    return mixed;
  }

  // Recherche de vidéos
  static async searchVideos(query: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // Chercher dans les hashtags et descriptions
    const videos = await prisma.video.findMany({
      where: {
        isDeleted: false,
        isPublic: true,
        OR: [
          {
            description: {
              contains: query,
              mode: 'insensitive'
            }
          },
          {
            hashtags: {
              some: {
                hashtag: {
                  name: {
                    contains: query,
                    mode: 'insensitive'
                  }
                }
              }
            }
          }
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            isVerified: true
          }
        },
        hashtags: {
          include: {
            hashtag: true
          }
        },
        _count: {
          select: {
            likes: true,
            comments: true
          }
        }
      },
      orderBy: [
        { views: 'desc' },
        { createdAt: 'desc' }
      ],
      skip,
      take: limit
    });

    const total = await prisma.video.count({
      where: {
        isDeleted: false,
        isPublic: true,
        OR: [
          {
            description: {
              contains: query,
              mode: 'insensitive'
            }
          },
          {
            hashtags: {
              some: {
                hashtag: {
                  name: {
                    contains: query,
                    mode: 'insensitive'
                  }
                }
              }
            }
          }
        ]
      }
    });

    return {
      videos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
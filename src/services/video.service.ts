import { prisma } from '../lib/prisma';
import { v2 as cloudinary } from 'cloudinary';

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

interface CreateVideoData {
  userId: string;
  title?: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl: string;
  duration: number;
  hashtags?: string[];
  soundId?: string;
}

export class VideoService {
  // Upload vidéo vers Cloudinary
  static async uploadToCloudinary(file: Express.Multer.File): Promise<{ videoUrl: string; thumbnailUrl: string; duration: number }> {
    try {
      // Upload vidéo
      const videoResult = await cloudinary.uploader.upload(file.path, {
        resource_type: 'video',
        folder: 'tiktok-app/videos',
        transformation: [
          { width: 1080, height: 1920, crop: 'fill' }, // Format 9:16
          { quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      });

      // Générer thumbnail
      const thumbnailUrl = cloudinary.url(videoResult.public_id, {
        resource_type: 'video',
        format: 'jpg',
        transformation: [
          { width: 400, height: 711, crop: 'fill' },
          { start_offset: '1' } // Frame à 1 seconde
        ]
      });

      return {
        videoUrl: videoResult.secure_url,
        thumbnailUrl,
        duration: Math.round(videoResult.duration || 0)
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new Error('Failed to upload video');
    }
  }

  // Créer une vidéo
  static async createVideo(data: CreateVideoData) {
    const { userId, title, description, videoUrl, thumbnailUrl, duration, hashtags, soundId } = data;

    // Créer la vidéo dans DB avec les URLs fournies
    const video = await prisma.video.create({
      data: {
        userId,
        videoUrl,
        thumbnailUrl,
        title: title || null,
        description: description || null,
        duration,
        soundId: soundId || null
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

    // Créer les hashtags
    if (hashtags && hashtags.length > 0) {
      for (const tag of hashtags) {
        const cleanTag = tag.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Trouver ou créer le hashtag
        const hashtag = await prisma.hashtag.upsert({
          where: { name: cleanTag },
          update: { videoCount: { increment: 1 } },
          create: { name: cleanTag, videoCount: 1 }
        });

        // Lier hashtag à la vidéo
        await prisma.hashtagOnVideo.create({
          data: {
            videoId: video.id,
            hashtagId: hashtag.id
          }
        });
      }
    }

    // Incrémenter le compteur de vidéos de l'user
    await prisma.user.update({
      where: { id: userId },
      data: { videosCount: { increment: 1 } }
    });

    return video;
  }

  // Récupérer une vidéo par ID
  static async getVideoById(videoId: string, userId?: string) {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
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
      }
    });

    if (!video) {
      throw new Error('Video not found');
    }

    // Vérifier si l'utilisateur a liké
    let isLiked = false;
    let isFavorited = false;
    
    if (userId) {
      const like = await prisma.like.findUnique({
        where: {
          userId_videoId: {
            userId,
            videoId
          }
        }
      });
      isLiked = !!like;

      const favorite = await prisma.favorite.findUnique({
        where: {
          userId_videoId: {
            userId,
            videoId
          }
        }
      });
      isFavorited = !!favorite;
    }

    return {
      ...video,
      isLiked,
      isFavorited,
      likesCount: video._count.likes,
      commentsCount: video._count.comments,
      favoritesCount: video._count.favorites
    };
  }

  // Récupérer les vidéos d'un user
  static async getUserVideos(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const videos = await prisma.video.findMany({
      where: {
        userId,
        isDeleted: false
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
        _count: {
          select: {
            likes: true,
            comments: true,
            favorites: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    const total = await prisma.video.count({
      where: { userId, isDeleted: false }
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

  // Récupérer les vidéos favorites d'un user
  static async getUserFavorites(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: {
        video: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
                isVerified: true
              }
            },
            _count: {
              select: {
                likes: true,
                comments: true,
                favorites: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    const total = await prisma.favorite.count({
      where: { userId }
    });

    return {
      videos: favorites.map(f => f.video),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Incrémenter les vues
  static async incrementViews(videoId: string) {
    await prisma.video.update({
      where: { id: videoId },
      data: {
        views: { increment: 1 }
      }
    });
  }

  // Supprimer une vidéo (soft delete)
  static async deleteVideo(videoId: string, userId: string) {
    // Vérifier que la vidéo appartient à l'user
    const video = await prisma.video.findUnique({
      where: { id: videoId }
    });

    if (!video) {
      throw new Error('Video not found');
    }

    if (video.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // Soft delete
    await prisma.video.update({
      where: { id: videoId },
      data: { isDeleted: true }
    });

    // Décrémenter le compteur
    await prisma.user.update({
      where: { id: userId },
      data: { videosCount: { decrement: 1 } }
    });

    return { message: 'Video deleted successfully' };
  }

  // Like une vidéo
  static async likeVideo(videoId: string, userId: string) {
    // Vérifier si déjà liké
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_videoId: {
          userId,
          videoId
        }
      }
    });

    if (existingLike) {
      throw new Error('Already liked');
    }

    // Créer le like
    await prisma.like.create({
      data: {
        userId,
        videoId
      }
    });

    // Incrémenter compteurs
    await prisma.video.update({
      where: { id: videoId },
      data: { likesCount: { increment: 1 } }
    });

    const video = await prisma.video.findUnique({
      where: { id: videoId }
    });

    if (video) {
      await prisma.user.update({
        where: { id: video.userId },
        data: { likesCount: { increment: 1 } }
      });
    }

    return { message: 'Video liked' };
  }

  // Unlike une vidéo
  static async unlikeVideo(videoId: string, userId: string) {
    const like = await prisma.like.findUnique({
      where: {
        userId_videoId: {
          userId,
          videoId
        }
      }
    });

    if (!like) {
      throw new Error('Not liked');
    }

    // Supprimer le like
    await prisma.like.delete({
      where: {
        userId_videoId: {
          userId,
          videoId
        }
      }
    });

    // Décrémenter compteurs
    await prisma.video.update({
      where: { id: videoId },
      data: { likesCount: { decrement: 1 } }
    });

    const video = await prisma.video.findUnique({
      where: { id: videoId }
    });

    if (video) {
      await prisma.user.update({
        where: { id: video.userId },
        data: { likesCount: { decrement: 1 } }
      });
    }

    return { message: 'Video unliked' };
  }

  // Ajouter aux favoris
  static async addToFavorites(videoId: string, userId: string) {
    // Vérifier si déjà en favoris
    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        userId_videoId: {
          userId,
          videoId
        }
      }
    });

    if (existingFavorite) {
      throw new Error('Already in favorites');
    }

    // Créer le favori
    await prisma.favorite.create({
      data: {
        userId,
        videoId
      }
    });

    return { message: 'Added to favorites' };
  }

  // Retirer des favoris
  static async removeFromFavorites(videoId: string, userId: string) {
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_videoId: {
          userId,
          videoId
        }
      }
    });

    if (!favorite) {
      throw new Error('Not in favorites');
    }

    // Supprimer le favori
    await prisma.favorite.delete({
      where: {
        userId_videoId: {
          userId,
          videoId
        }
      }
    });

    return { message: 'Removed from favorites' };
  }

  // Ajouter un commentaire
  static async addComment(videoId: string, userId: string, text: string, parentId?: string) {
    const comment = await prisma.comment.create({
      data: {
        videoId,
        userId,
        text,
        parentId: parentId || null
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

    // Incrémenter compteur
    await prisma.video.update({
      where: { id: videoId },
      data: { commentsCount: { increment: 1 } }
    });

    return comment;
  }

  // Récupérer les commentaires
  static async getComments(videoId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const comments = await prisma.comment.findMany({
      where: {
        videoId,
        parentId: null // Seulement les commentaires principaux
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
        replies: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
                isVerified: true
              }
            }
          },
          take: 3 // Limiter les réponses affichées
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    const total = await prisma.comment.count({
      where: { videoId, parentId: null }
    });

    return {
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Incrémenter le compteur de partages
  static async incrementShares(videoId: string) {
    await prisma.video.update({
      where: { id: videoId },
      data: { sharesCount: { increment: 1 } }
    });
    return { message: 'Share counted' };
  }
}
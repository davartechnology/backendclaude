import { prisma } from '../lib/prisma';
import { SetsService } from './sets.service';

export class UserService {
  // Récupérer un profil utilisateur
  static async getUserProfile(userId: string, viewerId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        balance: true,
        _count: {
          select: {
            videos: { where: { isDeleted: false } },
            followers: true,
            following: true
          }
        }
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Vérifier si le viewer suit cet user
    let isFollowing = false;
    if (viewerId && viewerId !== userId) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewerId,
            followingId: userId
          }
        }
      });
      isFollowing = !!follow;
    }

    const { passwordHash, ...userWithoutPassword } = user;

    return {
      ...userWithoutPassword,
      videosCount: user._count.videos,
      followersCount: user._count.followers,
      followingCount: user._count.following,
      isFollowing
    };
  }

  // Follow un utilisateur
  static async followUser(followerId: string, followingId: string) {
    // Vérifier qu'on ne se suit pas soi-même
    if (followerId === followingId) {
      throw new Error('Cannot follow yourself');
    }

    // Vérifier que l'utilisateur à suivre existe
    const userToFollow = await prisma.user.findUnique({
      where: { id: followingId }
    });

    if (!userToFollow) {
      throw new Error('User not found');
    }

    // Vérifier si déjà suivi
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId
        }
      }
    });

    if (existingFollow) {
      throw new Error('Already following');
    }

    // Créer le follow
    await prisma.follow.create({
      data: {
        followerId,
        followingId
      }
    });

    // Incrémenter les compteurs
    await prisma.user.update({
      where: { id: followerId },
      data: { followingCount: { increment: 1 } }
    });

    await prisma.user.update({
      where: { id: followingId },
      data: { followersCount: { increment: 1 } }
    });

    // ⭐ AJOUTER SETS : Nouveau follower = 1 set pour celui qui reçoit
    await SetsService.addSets(followingId, 'follower', 1, followerId);

    // Créer notification
    await prisma.notification.create({
      data: {
        userId: followingId,
        type: 'follow',
        title: '👥 Nouveau follower',
        message: `@${(await prisma.user.findUnique({ where: { id: followerId } }))?.username} vous suit maintenant !`
      }
    });

    return { message: 'User followed successfully' };
  }

  // Unfollow un utilisateur
  static async unfollowUser(followerId: string, followingId: string) {
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId
        }
      }
    });

    if (!follow) {
      throw new Error('Not following');
    }

    // Supprimer le follow
    await prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId,
          followingId
        }
      }
    });

    // Décrémenter les compteurs
    await prisma.user.update({
      where: { id: followerId },
      data: { followingCount: { decrement: 1 } }
    });

    await prisma.user.update({
      where: { id: followingId },
      data: { followersCount: { decrement: 1 } }
    });

    return { message: 'User unfollowed successfully' };
  }

  // Récupérer les followers d'un user
  static async getFollowers(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const followers = await prisma.follow.findMany({
      where: { followingId: userId },
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            bio: true,
            isVerified: true,
            followersCount: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    const total = await prisma.follow.count({
      where: { followingId: userId }
    });

    return {
      followers: followers.map(f => f.follower),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Récupérer les following d'un user
  static async getFollowing(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        following: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            bio: true,
            isVerified: true,
            followersCount: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    const total = await prisma.follow.count({
      where: { followerId: userId }
    });

    return {
      following: following.map(f => f.following),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Modifier son profil
  static async updateProfile(userId: string, data: {
    username?: string;
    bio?: string;
    avatarUrl?: string;
  }) {
    const { username, bio, avatarUrl } = data;

    // Vérifier si username déjà pris
    if (username) {
      const existingUser = await prisma.user.findUnique({
        where: { username }
      });

      if (existingUser && existingUser.id !== userId) {
        throw new Error('Username already taken');
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        username: username || undefined,
        bio: bio !== undefined ? bio : undefined,
        avatarUrl: avatarUrl || undefined
      }
    });

    const { passwordHash, ...userWithoutPassword } = updatedUser;

    return userWithoutPassword;
  }

  // Rechercher des utilisateurs
  static async searchUsers(query: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const users = await prisma.user.findMany({
      where: {
        OR: [
          {
            username: {
              contains: query,
              mode: 'insensitive'
            }
          },
          {
            bio: {
              contains: query,
              mode: 'insensitive'
            }
          }
        ]
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bio: true,
        isVerified: true,
        followersCount: true,
        videosCount: true
      },
      orderBy: {
        followersCount: 'desc'
      },
      skip,
      take: limit
    });

    const total = await prisma.user.count({
      where: {
        OR: [
          {
            username: {
              contains: query,
              mode: 'insensitive'
            }
          },
          {
            bio: {
              contains: query,
              mode: 'insensitive'
            }
          }
        ]
      }
    });

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';

interface LiveChatMessage {
  liveId: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  message: string;
  timestamp: Date;
}

interface GiftNotification {
  liveId: string;
  senderId: string;
  senderUsername: string;
  giftType: string;
  giftValue: number;
  timestamp: Date;
}

export function setupLiveWebSocket(io: Server) {
  // Namespace pour les lives
  const liveNamespace = io.of('/live');

  liveNamespace.on('connection', (socket: Socket) => {
    console.log(`User connected to live: ${socket.id}`);

    // Rejoindre un live room
    socket.on('join-live', async (data: { liveId: string; userId: string }) => {
      const { liveId, userId } = data;

      // Rejoindre la room
      socket.join(liveId);

      // Récupérer les infos de l'user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          username: true,
          avatarUrl: true
        }
      });

      // Notifier les autres viewers
      socket.to(liveId).emit('viewer-joined', {
        userId,
        username: user?.username,
        avatarUrl: user?.avatarUrl
      });

      console.log(`User ${userId} joined live ${liveId}`);
    });

    // Quitter un live room
    socket.on('leave-live', (data: { liveId: string; userId: string }) => {
      const { liveId, userId } = data;

      socket.leave(liveId);

      // Notifier les autres
      socket.to(liveId).emit('viewer-left', { userId });

      console.log(`User ${userId} left live ${liveId}`);
    });

    // Envoyer un message
    socket.on('send-message', async (data: LiveChatMessage) => {
      const { liveId, userId, message } = data;

      // Récupérer les infos de l'user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          username: true,
          avatarUrl: true,
          isVerified: true
        }
      });

      if (!user) return;

      // Broadcast le message à tous dans la room
      liveNamespace.to(liveId).emit('new-message', {
        liveId,
        userId,
        username: user.username,
        avatarUrl: user.avatarUrl,
        isVerified: user.isVerified,
        message,
        timestamp: new Date()
      });
    });

    // Notification de gift
    socket.on('gift-sent', (data: GiftNotification) => {
      const { liveId } = data;

      // Broadcast l'animation du gift à tous dans la room
      liveNamespace.to(liveId).emit('gift-received', data);
    });

    // Déconnexion
    socket.on('disconnect', () => {
      console.log(`User disconnected from live: ${socket.id}`);
    });
  });

  console.log('✅ Live WebSocket configured');
}
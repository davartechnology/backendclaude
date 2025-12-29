import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

interface SignupData {
  username: string;
  email: string;
  password: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface TokenPayload {
  userId: string;
  email: string;
}

export class AuthService {
  // Hash le mot de passe
  static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  // Compare le mot de passe
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Génère un access token JWT
  static generateAccessToken(payload: TokenPayload): string {
  const secret = process.env.JWT_SECRET || 'default_secret';
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
  return jwt.sign(payload, secret, { expiresIn } as any);
}

  // Génère un refresh token JWT
  static generateRefreshToken(payload: TokenPayload): string {
  const secret = process.env.JWT_REFRESH_SECRET || 'default_refresh_secret';
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn } as any);
}

  // Vérifie un token
  static verifyToken(token: string, isRefresh: boolean = false): TokenPayload {
    const secret = isRefresh 
      ? process.env.JWT_REFRESH_SECRET || 'default_refresh_secret'
      : process.env.JWT_SECRET || 'default_secret';
    
    return jwt.verify(token, secret) as TokenPayload;
  }

  // Inscription
  static async signup(data: SignupData) {
    const { username, email, password } = data;

    // Vérifier si email existe déjà
    const existingEmail = await prisma.user.findUnique({
      where: { email }
    });
    if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Vérifier si username existe déjà
    const existingUsername = await prisma.user.findUnique({
      where: { username }
    });
    if (existingUsername) {
      throw new Error('Username already exists');
    }

    // Hash le mot de passe
    const passwordHash = await this.hashPassword(password);

    // Créer l'utilisateur
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash
      }
    });

    // Créer la balance pour l'utilisateur
    await prisma.userBalance.create({
      data: {
        userId: user.id,
        availableBalance: 0,
        giftBalance: 0,
        pendingBalance: 0,
        lifetimeEarnings: 0,
        totalWithdrawn: 0
      }
    });

    // Générer les tokens
    const accessToken = this.generateAccessToken({
      userId: user.id,
      email: user.email
    });

    const refreshToken = this.generateRefreshToken({
      userId: user.id,
      email: user.email
    });

    // Retourner user sans le password
    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken
    };
  }

  // Connexion
  static async login(data: LoginData) {
    const { email, password } = data;

    console.log('🔓 LOGIN SERVICE - Email:', email);

    // Trouver l'utilisateur
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        balance: true
      }
    });

    if (!user) {
      console.log('❌ User not found:', email);
      throw new Error('Invalid credentials');
    }

    console.log('✅ User found:', user.id, user.username);

    // Vérifier si banni
    if (user.isBanned) {
      console.log('🚫 User is banned');
      throw new Error('Account is banned');
    }

    // Vérifier le mot de passe
    console.log('🔐 Comparing passwords...');
    const isPasswordValid = await this.comparePassword(password, user.passwordHash);
    console.log('Password valid:', isPasswordValid);
    
    if (!isPasswordValid) {
      console.log('❌ Password mismatch');
      throw new Error('Invalid credentials');
    }

    console.log('✅ Password valid - generating tokens');

    // Mettre à jour lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Générer les tokens
    const accessToken = this.generateAccessToken({
      userId: user.id,
      email: user.email
    });

    const refreshToken = this.generateRefreshToken({
      userId: user.id,
      email: user.email
    });

    // Retourner sans le password
    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken
    };
  }

  // Refresh token
  static async refreshAccessToken(refreshToken: string) {
    try {
      // Vérifier le refresh token
      const payload = this.verifyToken(refreshToken, true);

      // Vérifier que l'utilisateur existe toujours
      const user = await prisma.user.findUnique({
        where: { id: payload.userId }
      });

      if (!user || user.isBanned) {
        throw new Error('Invalid token');
      }

      // Générer un nouveau access token
      const accessToken = this.generateAccessToken({
        userId: user.id,
        email: user.email
      });

      return { accessToken };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  // Vérifier si un utilisateur existe
  static async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        balance: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';

export class AuthController {
  // POST /api/auth/signup
  static async signup(req: Request, res: Response) {
    try {
      const { username, email, password } = req.body;

      // Validation basique
      if (!username || !email || !password) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['username', 'email', 'password']
        });
      }

      // Validation email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: 'Invalid email format'
        });
      }

      // Validation username
      if (username.length < 3 || username.length > 30) {
        return res.status(400).json({
          error: 'Username must be between 3 and 30 characters'
        });
      }

      // Validation password
      if (password.length < 6) {
        return res.status(400).json({
          error: 'Password must be at least 6 characters'
        });
      }

      const result = await AuthService.signup({ username, email, password });

      console.log('✅ User created successfully:', result.user.id);
      return res.status(201).json({
        message: 'User created successfully',
        ...result
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          return res.status(409).json({ error: error.message });
        }
      }
      console.error('Signup error:', error);
      return res.status(500).json({
        error: 'Failed to create user'
      });
    }
  }

  // POST /api/auth/login
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      console.log('🔐 LOGIN REQUEST RECEIVED');
      console.log('Email:', email, 'Password:', password ? '***' : 'missing');

      // Validation
      if (!email || !password) {
        console.log('❌ Missing fields');
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['email', 'password']
        });
      }

      const result = await AuthService.login({ email, password });

      console.log('✅ Login successful for:', email);
      return res.status(200).json({
        message: 'Login successful',
        ...result
      });
    } catch (error) {
      if (error instanceof Error) {
        console.log('❌ Login error:', error.message);
        if (error.message.includes('Invalid credentials') || error.message.includes('banned')) {
          return res.status(401).json({ error: error.message });
        }
      }
      console.error('❌ Login error:', error);
      return res.status(500).json({
        error: 'Login failed'
      });
    }
  }

  // POST /api/auth/refresh
  static async refresh(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          error: 'Refresh token is required'
        });
      }

      const result = await AuthService.refreshAccessToken(refreshToken);

      return res.status(200).json(result);
    } catch (error) {
      return res.status(401).json({
        error: 'Invalid refresh token'
      });
    }
  }

  // GET /api/auth/me
  static async getMe(req: Request, res: Response) {
    try {
      // userId vient du middleware auth
      const userId = (req as any).userId;

      const user = await AuthService.getUserById(userId);

      return res.status(200).json({ user });
    } catch (error) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
  }

  // POST /api/auth/logout
  static async logout(req: Request, res: Response) {
    // Pour un vrai logout, on pourrait blacklister le token
    // Pour l'instant, le logout est géré côté client (supprimer le token)
    return res.status(200).json({
      message: 'Logout successful'
    });
  }
}
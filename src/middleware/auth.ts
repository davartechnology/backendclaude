// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

// Étendre le type Request pour inclure userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Middleware pour protéger les routes
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Récupérer le token du header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: 'No token provided',
        message: 'Authorization header is required'
      });
      return;
    }

    // Format: "Bearer TOKEN"
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({
        error: 'Invalid token format',
        message: 'Format should be: Bearer [token]'
      });
      return;
    }

    const token = parts[1];

    // Vérifier le token
    const payload = AuthService.verifyToken(token, false);

    // Ajouter userId à la requête
    req.userId = payload.userId;

    // Continuer vers la route
    next();
    return;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TokenExpiredError') {
        res.status(401).json({
          error: 'Token expired',
          message: 'Please refresh your token'
        });
        return;
      }
      if (error.name === 'JsonWebTokenError') {
        res.status(401).json({
          error: 'Invalid token',
          message: 'Token verification failed'
        });
        return;
      }
    }
    res.status(401).json({
      error: 'Authentication failed'
    });
    return;
  }
};

// Middleware optionnel (ne bloque pas si pas de token)
export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const token = parts[1];
        try {
          const payload = AuthService.verifyToken(token, false);
          req.userId = payload.userId;
        } catch (error) {
          // Ignorer les erreurs de token pour le middleware optionnel
        }
      }
    }

    next();
    return;
  } catch (error) {
    // Ne pas bloquer, juste continuer sans userId
    next();
    return;
  }
};

// Middleware pour vérifier si l'utilisateur existe et n'est pas banni
export const userStatusMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        error: 'Authentication required'
      });
      return;
    }

    const user = await AuthService.getUserById(req.userId);

    if (!user) {
      res.status(404).json({
        error: 'User not found'
      });
      return;
    }

    if (user.isBanned) {
      res.status(403).json({
        error: 'Account is banned',
        message: 'Your account has been suspended'
      });
      return;
    }

    // Ajouter les infos utilisateur complètes si nécessaire
    (req as any).user = user;
    
    next();
    return;
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error'
    });
    return;
  }
};

// Middleware combiné (auth + user status)
export const protectedRoute = [
  authMiddleware,
  userStatusMiddleware
];

// Middleware pour les routes admin (si vous ajoutez des rôles plus tard)
export const adminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        error: 'Authentication required'
      });
      return;
    }

    const user = await AuthService.getUserById(req.userId);

    if (!user) {
      res.status(404).json({
        error: 'User not found'
      });
      return;
    }

    // Si vous ajoutez un champ isAdmin ou role dans votre User model plus tard
    // if (!user.isAdmin) {
    //   res.status(403).json({
    //     error: 'Insufficient permissions',
    //     message: 'Admin access required'
    //   });
    //   return;
    // }

    next();
    return;
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error'
    });
    return;
  }
};

// Middleware pour vérifier la propriété (user ne peut modifier que ses propres données)
export const ownershipMiddleware = (resourceOwnerId: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Authentication required'
        });
        return;
      }

      // Vérifier si l'utilisateur est le propriétaire de la ressource
      if (req.userId !== resourceOwnerId) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You can only access your own resources'
        });
        return;
      }

      next();
      return;
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error'
      });
      return;
    }
  };
};
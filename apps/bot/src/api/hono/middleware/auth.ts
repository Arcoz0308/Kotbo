import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../../shared.js';

export type AuthClaims = {
  userId: string;
  username?: string;
  avatar?: string;
  discordToken?: string;
};

// Clé de contexte Hono pour les claims JWT
declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthClaims;
    authOptional: AuthClaims | null;
  }
}

/**
 * Middleware d'authentification JWT obligatoire.
 * Injecte `c.var.auth` avec les claims du token.
 * Retourne 401 si le token est absent ou invalide.
 */
export const requireAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Non authentifié — token manquant' });
  }

  const token = authHeader.slice(7);
  try {
    const claims = jwt.verify(token, getJwtSecret()) as AuthClaims;
    c.set('auth', claims);
  } catch {
    throw new HTTPException(401, { message: 'Token invalide ou expiré' });
  }

  await next();
});

/**
 * Middleware d'authentification JWT optionnel.
 * Injecte `c.var.authOptional` (null si pas de token).
 * Ne bloque jamais la requête.
 */
export const optionalAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const claims = jwt.verify(token, getJwtSecret()) as AuthClaims;
      c.set('authOptional', claims);
    } catch {
      c.set('authOptional', null);
    }
  } else {
    c.set('authOptional', null);
  }
  await next();
});

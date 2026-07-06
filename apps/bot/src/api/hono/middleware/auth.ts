import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../../shared.js';
import { getDashboardSession, sessionIdFromCookieHeader } from '../../auth/sessionStore.js';

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
  const legacyUntil = process.env.AUTH_LEGACY_BEARER_UNTIL;
  const legacyCutoff = legacyUntil ? (/^\d+$/.test(legacyUntil) ? Number(legacyUntil) : Date.parse(legacyUntil)) : 0;
  if (authHeader?.startsWith('Bearer ') && Number.isFinite(legacyCutoff) && Date.now() < legacyCutoff) {
    try {
      c.set('auth', jwt.verify(authHeader.slice(7), getJwtSecret()) as AuthClaims);
      await next();
      return;
    } catch {
      // Fall through to cookie authentication.
    }
  }

  const session = await getDashboardSession(sessionIdFromCookieHeader(c.req.header('cookie')));
  if (!session) throw new HTTPException(401, { message: 'Session absente ou expirée' });
  c.set('auth', {
    userId: session.userId,
    username: session.username,
    avatar: session.avatar ?? undefined,
    discordToken: session.discordAccessToken,
  });

  await next();
});

/**
 * Middleware d'authentification JWT optionnel.
 * Injecte `c.var.authOptional` (null si pas de token).
 * Ne bloque jamais la requête.
 */
export const optionalAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('authorization');
  const legacyUntil = process.env.AUTH_LEGACY_BEARER_UNTIL;
  const legacyCutoff = legacyUntil ? (/^\d+$/.test(legacyUntil) ? Number(legacyUntil) : Date.parse(legacyUntil)) : 0;
  if (authHeader?.startsWith('Bearer ') && Number.isFinite(legacyCutoff) && Date.now() < legacyCutoff) {
    try {
      c.set('authOptional', jwt.verify(authHeader.slice(7), getJwtSecret()) as AuthClaims);
      await next();
      return;
    } catch {
      // Fall through to cookie authentication.
    }
  }

  const session = await getDashboardSession(sessionIdFromCookieHeader(c.req.header('cookie')));
  c.set('authOptional', session ? {
    userId: session.userId,
    username: session.username,
    avatar: session.avatar ?? undefined,
    discordToken: session.discordAccessToken,
  } : null);
  await next();
});

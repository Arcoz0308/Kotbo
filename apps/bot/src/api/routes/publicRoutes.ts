import { type IncomingMessage, type ServerResponse } from 'node:http';
import { type Client, EmbedBuilder, ChannelType } from 'discord.js';
import jwt from 'jsonwebtoken';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { COLORS } from '../../utils/embeds.js';
import { isGuildActivated } from '../../utils/activation.js';
import {
  json,
  readJsonBody,
  verifyAuth,
  resolveProfileRoleDisplay,
  JWT_SECRET,
  DASHBOARD_URL,
  DASHBOARD_ORIGIN,
  resolveAdminAccess,
  resolveDashboardAccess,
  getGuildName,
  getClientIp,
  checkRateLimit,
  configRateLimiter,
  errorReportRateLimiter,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
} from '../apiHelpers.js';
import { getPublicProfileSnapshot } from '../../services/profileService.js';
import { generateRssXml } from '../../services/newsService.js';
import { translate } from '../../services/translationService.js';
import collectShardGuilds from '../apiHelpers.js'; // wait, it is exported from apiHelpers

const getMissingOAuthConfig = ({ includeSecret = false }: { includeSecret?: boolean } = {}) => {
  const missing: string[] = [];
  if (!DISCORD_CLIENT_ID?.trim()) missing.push('DISCORD_CLIENT_ID');
  if (!DISCORD_REDIRECT_URI?.trim()) missing.push('DISCORD_REDIRECT_URI');
  if (includeSecret && !DISCORD_CLIENT_SECRET?.trim()) missing.push('DISCORD_CLIENT_SECRET');
  return missing;
};

export async function handlePublicRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client
): Promise<boolean> {
  // GET /health
  if (url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'kotbo-dashboard-api' });
    return true;
  }

  // GET /api/config
  if (url.pathname === '/api/config' && req.method === 'GET') {
    const ip = getClientIp(req);
    if (!checkRateLimit(configRateLimiter, ip, 30, 60 * 1000)) {
      json(res, 429, { error: 'Trop de requêtes. Veuillez réessayer plus tard.' });
      return true;
    }

    const missingOAuth = getMissingOAuthConfig();
    if (missingOAuth.length > 0) {
      json(res, 500, {
        error: 'Configuration OAuth invalide côté serveur.',
        missing: missingOAuth,
      });
      return true;
    }

    json(res, 200, { discordClientId: DISCORD_CLIENT_ID });
    return true;
  }

  // POST /api/report-error
  if (parts[0] === 'api' && parts[1] === 'report-error' && req.method === 'POST') {
    const ip = getClientIp(req);
    if (!checkRateLimit(errorReportRateLimiter, ip, 5, 15 * 60 * 1000)) {
      json(res, 429, { error: 'Trop de rapports d\'erreur envoyés. Veuillez réessayer plus tard.' });
      return true;
    }

    try {
      const payload = await readJsonBody<{
        error: any;
        stack?: any;
        url: any;
        userAgent: any;
        guildId?: any;
      }>(req);

      if (
        !payload ||
        typeof payload.error !== 'string' ||
        payload.error.trim() === '' ||
        (payload.stack !== undefined && typeof payload.stack !== 'string') ||
        (payload.url !== undefined && typeof payload.url !== 'string') ||
        (payload.userAgent !== undefined && typeof payload.userAgent !== 'string') ||
        (payload.guildId !== undefined && payload.guildId !== null && typeof payload.guildId !== 'string')
      ) {
        json(res, 400, { error: 'Payload invalide' });
        return true;
      }

      const errorStr = payload.error.slice(0, 1000);
      const stackStr = payload.stack ? payload.stack.slice(0, 2000) : undefined;
      const urlStr = payload.url ? payload.url.slice(0, 500) : 'Inconnu';
      const userAgentStr = payload.userAgent ? payload.userAgent.slice(0, 250) : 'Inconnu';
      const guildIdStr = payload.guildId ? payload.guildId.slice(0, 50) : 'Aucun';

      const allowedOriginPattern = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)*(nathaan\.me|localhost)(:\d+)?(\/.*)?$/;
      if (payload.url && !allowedOriginPattern.test(payload.url)) {
        json(res, 400, { error: 'URL non autorisée' });
        return true;
      }

      const sanitizeMarkdown = (str: string) => str.replace(/`/g, '\\`');

      const user = verifyAuth(req);
      if (!user) {
        json(res, 401, { error: 'Non authentifié' });
        return true;
      }
      const userInfo = `**Utilisateur:** <@${user.userId}> (${user.username} - ID: ${user.userId})`;

      const ownerId = process.env.DISCORD_CLIENT_OWNER_ID;
      const adminsFromDb = await prisma.globalAdmin.findMany({
        select: { userId: true }
      });
      const adminIds = new Set<string>();
      if (ownerId) {
        adminIds.add(ownerId);
      }
      for (const a of adminsFromDb) {
        adminIds.add(a.userId);
      }

      if (adminIds.size === 0) {
        logger.error('Aucun administrateur configuré pour recevoir le rapport d\'erreur.');
        json(res, 500, { error: 'Aucun administrateur configuré' });
        return true;
      }

      const embed = new EmbedBuilder()
        .setTitle('🚨 Rapport d\'erreur du Dashboard')
        .setColor(0xFF0000)
        .setTimestamp()
        .addFields(
          { name: '👤 Utilisateur', value: userInfo },
          { name: '🌐 Page / URL', value: `\`${sanitizeMarkdown(urlStr)}\`` },
          { name: '💻 Navigateur', value: `\`${sanitizeMarkdown(userAgentStr)}\`` },
          { name: '🏰 Serveur sélectionné (Guild ID)', value: `\`${sanitizeMarkdown(guildIdStr)}\`` },
          { name: '❌ Erreur', value: `\`\`\`\n${sanitizeMarkdown(errorStr)}\n\`\`\`` }
        );

      if (stackStr) {
        embed.addFields({ name: '🥞 Stack Trace', value: `\`\`\`javascript\n${sanitizeMarkdown(stackStr)}\n\`\`\`` });
      }

      let sentCount = 0;
      for (const adminId of adminIds) {
        try {
          const adminUser = await client.users.fetch(adminId).catch(() => null);
          if (adminUser) {
            await adminUser.send({ embeds: [embed] });
            sentCount++;
          } else {
            logger.warn('ReportError', `Impossible de trouver l'administrateur avec l'ID ${adminId}`);
          }
        } catch (err: any) {
          logger.error('ReportError', `Erreur lors de l'envoi du rapport à l'admin ${adminId}: ${err.message}`);
        }
      }

      if (sentCount === 0) {
        json(res, 500, { error: 'Impossible d\'envoyer le rapport aux administrateurs' });
        return true;
      }

      json(res, 200, { success: true });
    } catch (err: any) {
      logger.error('ReportError', `Erreur lors de la transmission du rapport d'erreur: ${err.message}`);
      json(res, 500, { error: 'Erreur lors de la transmission' });
    }
    return true;
  }

  // GET/PATCH/activity-image /api/public/profile/:userId
  if (parts[0] === 'api' && parts[1] === 'public' && parts[2] === 'profile' && parts[3]) {
    const userId = parts[3];
    if (!/^\d{17,19}$/.test(userId)) {
      json(res, 400, { error: 'ID utilisateur invalide' });
      return true;
    }

    // GET /api/public/profile/:userId/activity-image
    if (parts[4] === 'activity-image' && req.method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '14', 10);
      try {
        const since = new Date();
        since.setDate(since.getDate() - days + 1);
        const startKey = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;

        const stats = await prisma.memberDailyStat.findMany({
          where: { userId, dateKey: { gte: startKey } },
          orderBy: { dateKey: 'asc' },
        });

        const map: Record<string, { messages: number; voice: number }> = Object.create(null);
        for (const s of stats) {
          if (!map[s.dateKey]) map[s.dateKey] = { messages: 0, voice: 0 };
          map[s.dateKey].messages += s.messagesCount;
          map[s.dateKey].voice += s.voiceMinutes;
        }

        const dailyData = Object.keys(map)
          .sort()
          .map((date) => ({ date, messages: map[date].messages, voice: map[date].voice }));

        const totalMessages = dailyData.reduce((a, b) => a + b.messages, 0);
        const totalVoice = dailyData.reduce((a, b) => a + b.voice, 0);
        const activeDays = dailyData.length;
        const peakDayMessages = dailyData.reduce((a, b) => Math.max(a, b.messages), 0);

        const { generateMemberStatsImage } = await import('../../services/imageService.js');
        const buffer = await generateMemberStatsImage(userId, days, { totalMessages, totalVoice, activeDays, peakDayMessages }, dailyData);

        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' });
        res.end(buffer);
      } catch (err) {
        logger.error('PublicAPI', `Error generating activity image for ${userId}:`, err);
        json(res, 500, { error: 'Erreur lors de la génération du graphique' });
      }
      return true;
    }

    // PATCH /api/public/profile/:userId
    if (req.method === 'PATCH') {
      const authUser = verifyAuth(req);
      if (!authUser) {
        json(res, 401, { error: 'Non authentifié' });
        return true;
      }

      try {
        const snapshot = await getPublicProfileSnapshot(userId);
        if (!snapshot) {
          json(res, 404, { error: 'Profil introuvable' });
          return true;
        }

        if (authUser.userId !== userId) {
          json(res, 403, { error: 'Seul le propriétaire du profil peut le modifier' });
          return true;
        }

        const body = await readJsonBody<{ bio?: string | null; isProfilePrivate?: boolean }>(req);
        const updatedProfile = await prisma.memberProfile.update({
          where: { id: snapshot.memberProfile.id },
          data: {
            bio: typeof body?.bio === 'string' ? body.bio.trim() : body?.bio === null ? null : snapshot.memberProfile.bio,
            isProfilePrivate: typeof body?.isProfilePrivate === 'boolean'
              ? body.isProfilePrivate
              : snapshot.memberProfile.isProfilePrivate,
          },
        });

        json(res, 200, {
          ok: true,
          profile: {
            bio: updatedProfile.bio,
            isProfilePrivate: updatedProfile.isProfilePrivate,
          },
        });
      } catch (err) {
        logger.error('PublicAPI', `Error updating public profile for ${userId}:`, err);
        json(res, 500, { error: 'Erreur lors de la mise à jour du profil' });
      }
      return true;
    }

    // GET /api/public/profile/:userId
    if (req.method === 'GET') {
      try {
        let snapshot = await getPublicProfileSnapshot(userId);
        let profile = snapshot?.memberProfile;

        if (!snapshot || !profile) {
          const discordUser = await client.users.fetch(userId).catch(() => null);
          if (!discordUser) {
            json(res, 404, { error: 'Utilisateur introuvable' });
            return true;
          }

          const sharedGuild = client.guilds.cache.find(g => g.members.cache.has(userId));
          const fallbackGuildId = sharedGuild?.id || client.guilds.cache.first()?.id || '';

          profile = {
            id: `${fallbackGuildId}:${userId}`,
            guildId: fallbackGuildId,
            userId: userId,
            userTag: discordUser.tag,
            username: discordUser.username,
            globalName: discordUser.globalName || null,
            displayName: discordUser.globalName || discordUser.username,
            avatarUrl: discordUser.displayAvatarURL(),
            bannerUrl: null,
            accentColor: discordUser.accentColor || null,
            locale: null,
            isBot: discordUser.bot,
            bio: null,
            isProfilePrivate: false,
            accountCreatedAt: discordUser.createdAt,
            guildJoinedAt: null,
            guildLeftAt: null,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            lastMessageAt: null,
            lastMessageChannelId: null,
            messageCount: 0,
            voiceSessionCount: 0,
            voiceTimeSeconds: 0,
            voiceLastChannelId: null,
            voiceLastJoinedAt: null,
            voiceLastLeftAt: null,
            rolesSnapshot: [],
            isSuspectedDC: false,
            moderatorNote: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any;

          snapshot = {
            memberProfile: profile,
            invite: null,
            eventParticipations: [],
            dailyAlgoProfile: null,
            dailyAlgoParticipations: [],
          };
        }

        const roleDisplay = await resolveProfileRoleDisplay(client, profile.guildId, profile.rolesSnapshot);
        const authUser = verifyAuth(req);
        const viewerGuildAccess = authUser
          ? await resolveDashboardAccess(client, profile.guildId, authUser.userId).catch(() => null)
          : null;
        const canViewPrivate = !profile.isProfilePrivate || authUser?.userId === userId || !!viewerGuildAccess?.level && viewerGuildAccess.level !== 'none';

        const response = canViewPrivate
          ? {
              userId: profile.userId,
              username: profile.username,
              globalName: profile.globalName,
              displayName: profile.displayName || profile.globalName || profile.username,
              avatar: profile.avatarUrl,
              banner: profile.bannerUrl,
              bio: profile.bio,
              isPrivate: profile.isProfilePrivate,
              roles: roleDisplay.roles,
              primaryRole: roleDisplay.primaryRole,
              accountCreatedAt: profile.accountCreatedAt,
              guildJoinedAt: profile.guildJoinedAt,
              guildLeftAt: profile.guildLeftAt,
              lastSeenAt: profile.lastSeenAt,
              messageCount: profile.messageCount,
              voiceTimeSeconds: profile.voiceTimeSeconds,
              invite: snapshot.invite,
              points: snapshot.dailyAlgoProfile?.totalPoints || 0,
              tier: snapshot.dailyAlgoProfile?.tier || 'Débutant',
              streak: snapshot.dailyAlgoProfile?.currentStreak || 0,
              rank: snapshot.dailyAlgoProfile ? snapshot.dailyAlgoProfile.rank - 1 : 0,
              recentAlgos: snapshot.dailyAlgoParticipations.map((entry) => ({
                title: entry.problemTitle,
                date: entry.submittedAt ? entry.submittedAt.toISOString() : new Date().toISOString(),
                status: entry.status,
                points: entry.totalPoints,
              })),
              eventParticipations: snapshot.eventParticipations.map((entry) => ({
                id: entry.id,
                eventId: entry.eventId,
                title: entry.eventTitle,
                type: entry.eventType,
                date: entry.createdAt.toISOString(),
                score: entry.score,
              })),
            }
          : {
              userId: profile.userId,
              username: profile.username,
              globalName: profile.globalName,
              displayName: profile.displayName || profile.globalName || profile.username,
              avatar: profile.avatarUrl,
              banner: profile.bannerUrl,
              bio: null,
              isPrivate: true,
              roles: roleDisplay.roles,
              primaryRole: roleDisplay.primaryRole,
              accountCreatedAt: null,
              guildJoinedAt: null,
              guildLeftAt: profile.guildLeftAt,
              lastSeenAt: null,
              messageCount: null,
              voiceTimeSeconds: null,
              invite: null,
              points: 0,
              tier: 'Débutant',
              streak: 0,
              rank: 0,
              recentAlgos: [],
              eventParticipations: [],
            };

        json(res, 200, response);
      } catch (err) {
        logger.error('PublicAPI', `Error fetching public profile for ${userId}:`, err);
        json(res, 500, { error: 'Erreur interne du serveur' });
      }
      return true;
    }
  }

  // GET /api/public/rss/:guildId
  if (parts[0] === 'api' && parts[1] === 'public' && parts[2] === 'rss' && parts[3] && req.method === 'GET') {
    const guildId = parts[3];
    if (!/^\d{17,19}$/.test(guildId)) {
      json(res, 400, { error: 'ID de guilde invalide' });
      return true;
    }
    const category = parts[4] ? decodeURIComponent(parts[4]) : url.searchParams.get('category');
    const subcategory = parts[5] ? decodeURIComponent(parts[5]) : url.searchParams.get('subcategory');
    
    try {
      const guild = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { id: true }
      });
      if (!guild) {
        json(res, 404, { error: 'Guilde introuvable' });
        return true;
      }

      const whereClause: any = { guildId, published: true };
      if (category) {
        whereClause.category = { equals: category, mode: 'insensitive' };
      }
      if (subcategory) {
        whereClause.subcategory = { equals: subcategory, mode: 'insensitive' };
      }

      const articles = await prisma.newsArticle.findMany({
        where: whereClause,
        orderBy: { publishedAt: 'desc' }
      });

      const discordGuild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      const guildName = discordGuild?.name ?? `Serveur ${guildId}`;
      const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';
      const apiUrl = process.env.VITE_API_URL || '';

      const rssXml = generateRssXml(guildName, guildId, dashboardUrl, apiUrl, articles, category, subcategory);

      res.writeHead(200, {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      });
      res.end(rssXml);
    } catch (err: any) {
      logger.error('PublicAPI', `Error generating RSS for guild ${guildId}: ${err.message}`);
      json(res, 500, { error: 'Erreur lors de la génération du flux RSS' });
    }
    return true;
  }

  // GET /api/public/guilds/:guildId/news
  if (parts[0] === 'api' && parts[1] === 'public' && parts[2] === 'guilds' && parts[3] && parts[4] === 'news' && req.method === 'GET') {
    const guildId = parts[3];
    if (!/^\d{17,19}$/.test(guildId)) {
      json(res, 400, { error: 'ID de guilde invalide' });
      return true;
    }

    try {
      const guild = await prisma.guild.findUnique({
        where: { id: guildId },
        select: { id: true },
      });

      if (!guild) {
        json(res, 404, { error: 'Guilde introuvable' });
        return true;
      }

      const articles = await prisma.newsArticle.findMany({
        where: { guildId, published: true },
        orderBy: { publishedAt: 'desc' },
      });

      json(res, 200, articles);
    } catch (err: any) {
      logger.error('PublicAPI', `Error listing public news for guild ${guildId}: ${err.message}`);
      json(res, 500, { error: 'Erreur lors de la récupération des actualités publiques' });
    }
    return true;
  }

  // GET /api/public/transcripts/:transcriptId
  if (parts[0] === 'api' && parts[1] === 'public' && parts[2] === 'transcripts' && parts[3] && req.method === 'GET') {
    const transcriptId = parts[3];
    if (!/^[a-zA-Z0-9_\-]+$/.test(transcriptId)) {
      json(res, 400, { error: 'ID de transcription invalide' });
      return true;
    }
    try {
      const transcript = await prisma.transcript.findUnique({
        where: { id: transcriptId }
      });

      if (!transcript) {
        json(res, 404, { error: 'Transcription introuvable' });
        return true;
      }

      res.removeHeader('X-Frame-Options');
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'none'",
          "style-src 'unsafe-inline'",
          'img-src https: data:',
          'media-src https:',
          `frame-ancestors ${DASHBOARD_ORIGIN} http://localhost:5173 http://localhost:3000`,
          "base-uri 'none'",
          "form-action 'none'",
        ].join('; ')
      );
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.statusCode = 200;
      res.end(transcript.html);
    } catch (err: any) {
      logger.error('PublicAPI', `Error fetching public transcript ${transcriptId}: ${err.message}`);
      json(res, 500, { error: 'Erreur interne du serveur' });
    }
    return true;
  }

  // --- OAUTH AUTH ROUTES ---
  if (parts.length >= 2 && parts[0] === 'api' && parts[1] === 'auth') {
    // GET /api/auth/login
    if (parts[2] === 'login' && req.method === 'GET') {
      const missingOAuth = getMissingOAuthConfig({ includeSecret: false });
      if (missingOAuth.length > 0) {
        json(res, 500, {
          error: 'Configuration OAuth invalide côté serveur.',
          missing: missingOAuth,
        });
        return true;
      }

      const urlObj = new URL('https://discord.com/api/oauth2/authorize');
      urlObj.searchParams.set('client_id', DISCORD_CLIENT_ID!);
      urlObj.searchParams.set('redirect_uri', DISCORD_REDIRECT_URI!);
      urlObj.searchParams.set('response_type', 'code');
      urlObj.searchParams.set('scope', 'identify guilds connections');
      urlObj.searchParams.set('prompt', 'consent');

      json(res, 200, { url: urlObj.toString() });
      return true;
    }

    // GET /api/auth/callback
    if (parts[2] === 'callback' && req.method === 'GET') {
      const code = url.searchParams.get('code');
      if (!code) {
        json(res, 400, { error: 'Code d\'autorisation manquant' });
        return true;
      }

      const missingOAuth = getMissingOAuthConfig({ includeSecret: true });
      if (missingOAuth.length > 0) {
        res.writeHead(302, { Location: `${DASHBOARD_URL}/login?error=auth_failed` });
        res.end();
        return true;
      }

      try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID!,
            client_secret: DISCORD_CLIENT_SECRET!,
            grant_type: 'authorization_code',
            code,
            redirect_uri: DISCORD_REDIRECT_URI!,
          }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (!tokenResponse.ok) {
          const errData = await tokenResponse.json().catch(() => null);
          logger.error('Auth', 'Failed to exchange OAuth code:', errData);
          res.writeHead(302, { Location: `${DASHBOARD_URL}/login?error=auth_failed` });
          res.end();
          return true;
        }

        const oauthData = await tokenResponse.json() as { access_token: string };

        const userResponse = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${oauthData.access_token}` },
        });

        if (!userResponse.ok) {
          res.writeHead(302, { Location: `${DASHBOARD_URL}/login?error=auth_failed` });
          res.end();
          return true;
        }

        const userData = await userResponse.json() as { id: string; username: string; global_name?: string; avatar?: string };

        const token = jwt.sign(
          {
            userId: userData.id,
            username: userData.username,
            globalName: userData.global_name,
            avatar: userData.avatar,
            discordToken: oauthData.access_token,
          },
          JWT_SECRET!,
          { expiresIn: '7d' }
        );

        res.writeHead(302, { Location: `${DASHBOARD_URL}/login?token=${token}` });
        res.end();
      } catch (err: any) {
        logger.error('Auth', `Erreur callback OAuth: ${err.stack || err.message}`);
        res.writeHead(302, { Location: `${DASHBOARD_URL}/login?error=auth_failed` });
        res.end();
      }
      return true;
    }
  }

  // --- USER API ENDPOINTS ---
  if (parts.length >= 2 && parts[0] === 'api' && parts[1] === 'user') {
    const user = verifyAuth(req);
    if (!user) {
      json(res, 401, { error: 'Non authentifié' });
      return true;
    }

    // GET /api/user/me
    if (parts[2] === 'me') {
      const authHeader = req.headers.authorization;
      const token = authHeader!.split(' ')[1];
      const decoded = jwt.decode(token) as any;
      const isBotAdmin = await resolveAdminAccess(client, decoded.userId);
      json(res, 200, { id: decoded.userId, username: decoded.username, avatar: decoded.avatar, isBotAdmin });
      return true;
    }

    // GET /api/user/guilds
    if (parts[2] === 'guilds') {
      try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.split(' ')[1];
        if (!token) {
          json(res, 401, { error: 'Token manquant' });
          return true;
        }

        const decoded = jwt.decode(token) as any;
        if (!decoded || !decoded.discordToken) {
          json(res, 401, { error: 'Token invalide' });
          return true;
        }

        const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
          headers: { Authorization: `Bearer ${decoded.discordToken}` },
        });

        if (!guildsResponse.ok) {
          if (guildsResponse.status === 401) {
            json(res, 401, { error: 'Token Discord expiré' });
            return true;
          }
          json(res, guildsResponse.status, { error: 'Impossible de récupérer vos serveurs Discord' });
          return true;
        }

        const userGuilds = await guildsResponse.json() as Array<{ id: string; name: string; icon: string; permissions: string }>;

        const botGuilds = await prisma.guild.findMany({
          select: { id: true }
        });
        const botGuildIds = new Set(botGuilds.map((g) => g.id));

        const isGlobalAdmin = await resolveAdminAccess(client, decoded.userId);

        const payload = await Promise.all(
          userGuilds
            .filter((userGuild) => {
              const permissions = BigInt(userGuild.permissions);
              const isAdmin = (permissions & 0x8n) === 0x8n || (permissions & 0x20n) === 0x20n;
              const hasBot = botGuildIds.has(userGuild.id);
              return isGlobalAdmin || (isAdmin && hasBot);
            })
            .map(async (userGuild) => {
              const access = await resolveDashboardAccess(client, userGuild.id, decoded.userId, BigInt(userGuild.permissions));
              return {
                id: userGuild.id,
                name: userGuild.name,
                icon: userGuild.icon ? `https://cdn.discordapp.com/icons/${userGuild.id}/${userGuild.icon}.png` : null,
                permissions: userGuild.permissions,
                accessLevel: access.level,
                activated: isGuildActivated(userGuild.id),
              };
            })
        );

        json(res, 200, payload);
      } catch (err: any) {
        logger.error('UserAPI', `Error listing user guilds: ${err.message}`);
        json(res, 500, { error: 'Erreur serveur lors de la récupération de vos serveurs' });
      }
      return true;
    }
  }

  // POST /api/dashboard/translate
  if (parts.length >= 2 && parts[0] === 'api' && parts[1] === 'dashboard' && parts[2] === 'translate' && req.method === 'POST') {
    const user = verifyAuth(req);
    if (!user) {
      json(res, 401, { error: 'Non authentifié' });
      return true;
    }
    const body = await readJsonBody<{ text: string; targetLang?: string }>(req);
    if (!body?.text) {
      json(res, 400, { error: 'Texte à traduire requis' });
      return true;
    }
    const translatedText = await translate(body.text, body.targetLang || 'fr');
    json(res, 200, { translatedText });
    return true;
  }

  // GET /api/dashboard/guilds (List of all guilds with access)
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'dashboard' && parts[2] === 'guilds' && req.method === 'GET') {
    const user = verifyAuth(req);
    if (!user) {
      json(res, 401, { error: 'Non authentifié' });
      return true;
    }

    try {
      const guilds = await prisma.guild.findMany({
        orderBy: { updatedAt: 'desc' },
        select: { id: true, updatedAt: true }
      });

      const payload: Array<{
        id: string;
        name: string;
        updatedAt: string;
        accessLevel: 'admin' | 'moderator';
        activated: boolean;
      }> = [];

      const isGlobalAdmin = await resolveAdminAccess(client, user.userId);
      for (const guild of guilds) {
        const activated = isGuildActivated(guild.id);
        if (!activated && !isGlobalAdmin) continue;

        const access = await resolveDashboardAccess(client, guild.id, user.userId);
        if (!access.canViewDashboard) continue;

        payload.push({
          id: guild.id,
          name: getGuildName(client, guild.id),
          updatedAt: guild.updatedAt.toISOString(),
          accessLevel: access.level === 'admin' ? 'admin' : 'moderator',
          activated: activated
        });
      }

      json(res, 200, { guilds: payload });
    } catch (err: any) {
      logger.error('DashboardAPI', `Error listing all dashboard guilds: ${err.message}`);
      json(res, 500, { error: 'Erreur lors du chargement des serveurs' });
    }
    return true;
  }

  return false;
}

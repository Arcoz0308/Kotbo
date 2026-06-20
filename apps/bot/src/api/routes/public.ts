import { IncomingMessage, ServerResponse } from 'node:http';
import { Client } from 'discord.js';
import { Prisma } from '@prisma/client';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import {
  json,
  verifyAuth,
  getPublicProfileSnapshot,
  resolveProfileRoleDisplay,
  resolveDashboardAccess,
  readJsonBody,
  configRateLimiter,
  checkRateLimit,
  getClientIp,
  getMissingOAuthConfig,
  DISCORD_CLIENT_ID,
  DASHBOARD_ORIGIN,
} from '../shared.js';
import { generateRssXml } from '../../services/core/newsService.js';

export async function handlePublicRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  url: URL,
  client: Client
): Promise<boolean> {
  const method = req.method;

  // GET /health
  if (url.pathname === '/health' && method === 'GET') {
    json(res, 200, { ok: true, service: 'kotbo-dashboard-api' });
    return true;
  }

  // GET /.well-known/oauth-authorization-server — MCP OAuth discovery (root-level)
  if (url.pathname === '/.well-known/oauth-authorization-server' && method === 'GET') {
    const base = `${url.protocol}//${url.host}`;
    json(res, 200, {
      issuer: base,
      authorization_endpoint: `${base}/api/mcp/{guildId}/oauth/authorize`,
      token_endpoint: `${base}/api/mcp/{guildId}/oauth/token`,
      grant_types_supported: ['client_credentials'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      response_types_supported: ['token'],
      scopes_supported: ['mcp'],
    });
    return true;
  }

  // GET /api/config
  if (url.pathname === '/api/config' && method === 'GET') {
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

  // Check if it's api/public
  if (parts[0] !== 'api' || parts[1] !== 'public') {
    return false;
  }

  // GET /api/public/profile/:userId
  if (parts[2] === 'profile' && parts[3] && !parts[4] && method === 'GET') {
    const userId = parts[3];
    if (!/^\d{17,19}$/.test(userId)) {
      json(res, 400, { error: 'ID utilisateur invalide' });
      return true;
    }
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
        };

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

  // PATCH /api/public/profile/:userId
  if (parts[2] === 'profile' && parts[3] && !parts[4] && method === 'PATCH') {
    const userId = parts[3];
    if (!/^\d{17,19}$/.test(userId)) {
      json(res, 400, { error: 'ID utilisateur invalide' });
      return true;
    }
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

  // GET /api/public/profile/:userId/activity-image
  if (parts[2] === 'profile' && parts[3] && parts[4] === 'activity-image' && method === 'GET') {
    const userId = parts[3];
    if (!/^\d{17,19}$/.test(userId)) {
      json(res, 400, { error: 'ID utilisateur invalide' });
      return true;
    }
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

      const { generateMemberStatsImage } = await import('../../services/core/imageService.js');
      const buffer = await generateMemberStatsImage(userId, days, { totalMessages, totalVoice, activeDays, peakDayMessages }, dailyData);

      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' });
      res.end(buffer);
    } catch (err) {
      logger.error('PublicAPI', `Error generating activity image for ${parts[3]}:`, err);
      json(res, 500, { error: 'Erreur lors de la génération du graphique' });
    }
    return true;
  }

  // GET /api/public/rss/:guildId
  if (parts[2] === 'rss' && parts[3] && method === 'GET') {
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

      const whereClause: Prisma.NewsArticleWhereInput = { guildId, published: true };
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
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error('PublicAPI', `Error generating RSS for guild ${guildId}: ${errMessage}`);
      json(res, 500, { error: 'Erreur lors de la génération du flux RSS' });
    }
    return true;
  }

  // GET /api/public/guilds/:guildId/news
  if (parts[2] === 'guilds' && parts[3] && parts[4] === 'news' && method === 'GET') {
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
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error('PublicAPI', `Error listing public news for guild ${guildId}: ${errMessage}`);
      json(res, 500, { error: 'Erreur lors de la récupération des actualités publiques' });
    }
    return true;
  }

  // GET /api/public/guilds/:guildId/leveling
  if (parts[2] === 'guilds' && parts[3] && parts[4] === 'leveling' && !parts[5] && method === 'GET') {
    const guildId = parts[3];
    if (!/^\d{17,19}$/.test(guildId)) {
      json(res, 400, { error: 'ID de guilde invalide' });
      return true;
    }

    try {
      const config = await prisma.levelConfig.findUnique({
        where: { guildId },
      });

      if (!config || !config.enabled) {
        json(res, 200, { enabled: false, levels: [], guildName: 'Kotbo Server' });
        return true;
      }

      const levels = await prisma.memberLevel.findMany({
        where: { guildId },
        orderBy: { xp: 'desc' },
      });

      // Charger les profils de membres de la base de données
      const userIds = levels.map(l => l.userId);
      const dbProfiles = await prisma.memberProfile.findMany({
        where: {
          guildId,
          userId: { in: userIds }
        }
      });
      const profileMap = new Map(dbProfiles.map(p => [p.userId, p]));

      // Charger les membres depuis le cache du serveur Discord si présent
      const discordGuild = client.guilds.cache.get(guildId);

      const levelsWithUserData = levels.map(l => {
        const profile = profileMap.get(l.userId);
        const discordMember = discordGuild?.members.cache.get(l.userId);

        const username = discordMember?.user?.username || profile?.username || null;
        const displayName = discordMember?.displayName || profile?.displayName || profile?.globalName || `Utilisateur ${l.userId}`;
        const avatarUrl = discordMember?.user?.displayAvatarURL({ size: 128 }) || profile?.avatarUrl || null;

        return {
          userId: l.userId,
          xp: l.xp,
          level: l.level,
          username,
          displayName,
          avatarUrl
        };
      });

      json(res, 200, {
        enabled: true,
        guildName: discordGuild?.name || 'Kotbo Server',
        guildIcon: discordGuild?.iconURL({ size: 128 }) || null,
        levels: levelsWithUserData
      });
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error('PublicAPI', `Error fetching public leveling for guild ${guildId}: ${errMessage}`);
      json(res, 500, { error: 'Erreur lors du chargement du classement de leveling' });
    }
    return true;
  }

  // GET /api/public/transcripts/:transcriptId
  if (parts[2] === 'transcripts' && parts[3] && method === 'GET') {
    const transcriptId = parts[3];
    if (!/^[a-zA-Z0-9_-]+$/.test(transcriptId)) {
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
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error('PublicAPI', `Error fetching public transcript ${transcriptId}: ${errMessage}`);
      json(res, 500, { error: 'Erreur interne du serveur' });
    }
    return true;
  }

  // GET /api/public/forms/:formId - Get form structure (no auth)
  if (parts[2] === 'forms' && parts[3] && !parts[4] && method === 'GET') {
    const formId = parts[3];
    try {
      const form = await prisma.recruitmentForm.findFirst({
        where: { id: formId, isActive: true },
        select: {
          id: true,
          name: true,
          description: true,
          structure: true,
          guildId: true,
        },
      });

      if (!form) {
        json(res, 404, { error: 'Formulaire introuvable ou inactif' });
        return true;
      }

      json(res, 200, {
        id: form.id,
        name: form.name,
        description: form.description,
        structure: form.structure,
        guildId: form.guildId,
      });
    } catch (err) {
      logger.error('PublicAPI', `Error fetching public form ${parts[3]}:`, err);
      json(res, 500, { error: 'Erreur lors du chargement du formulaire' });
    }
    return true;
  }

  // POST /api/public/forms/:formId/submit - Submit a form response (no auth)
  if (parts[2] === 'forms' && parts[3] && parts[4] === 'submit' && method === 'POST') {
    const formId = parts[3];
    try {
      const form = await prisma.recruitmentForm.findFirst({
        where: { id: formId, isActive: true },
      });

      if (!form) {
        json(res, 404, { error: 'Formulaire introuvable ou inactif' });
        return true;
      }

      const body = await readJsonBody<{
        data: Record<string, unknown>;
        discordId?: string;
        email?: string;
        username?: string;
      }>(req);

      if (!body?.data || typeof body.data !== 'object') {
        json(res, 400, { error: 'Les données de réponse sont requises' });
        return true;
      }

      // Create the candidature
      const candidature = await prisma.recruitmentCandidature.create({
        data: {
          guildId: form.guildId,
          formId: form.id,
          discordId: body.discordId || null,
          email: body.email || null,
          username: body.username || null,
          data: body.data as Prisma.JsonObject,
          status: 'PENDING',
        },
      });

      // Increment submission counter
      await prisma.recruitmentForm.update({
        where: { id: formId },
        data: { submissionsCount: { increment: 1 } },
      });

      // Trigger Discord notification if a webhook channel is configured
      try {
        const guildConfig = await prisma.guild.findUnique({
          where: { id: form.guildId },
          select: { recruitmentLogChannelId: true },
        });
        if (guildConfig?.recruitmentLogChannelId) {
          const discordGuild = client.guilds.cache.get(form.guildId) || await client.guilds.fetch(form.guildId).catch(() => null);
          const channel = discordGuild?.channels.cache.get(guildConfig.recruitmentLogChannelId);
          if (channel?.isSendable()) {
            await channel.send({
              embeds: [{
                title: '📋 Nouvelle candidature reçue',
                description: `Formulaire: **${form.name}**\n\nDiscord: ${body.discordId ? `<@${body.discordId}>` : 'Non renseigné'}\nEmail: ${body.email || 'Non renseigné'}`,
                color: 0x6366f1,
                timestamp: new Date().toISOString(),
                footer: { text: `Candidature ID: ${candidature.id}` },
              }],
            });
          }
        }
      } catch (notifErr) {
        logger.warn('PublicAPI', 'Could not send Discord notification for form submission:', notifErr);
      }

      logger.success('PublicAPI', `Form submission for ${formId} from ${body.discordId || 'unknown'}`);
      json(res, 201, { ok: true, id: candidature.id });
    } catch (err) {
      logger.error('PublicAPI', `Error submitting form ${parts[3]}:`, err);
      json(res, 500, { error: 'Erreur lors de la soumission du formulaire' });
    }
    return true;
  }

  // GET /api/public/custom-forms/:formId - Get custom form structure (no auth)
  if (parts[2] === 'custom-forms' && parts[3] && !parts[4] && method === 'GET') {
    const formId = parts[3];
    try {
      // @ts-expect-error - Prisma client needs to be regenerated by user to recognize customForm
      const form = await prisma.customForm.findFirst({
        where: { id: formId, isActive: true },
        select: {
          id: true,
          name: true,
          description: true,
          structure: true,
          guildId: true,
        },
      });

      if (!form) {
        json(res, 404, { error: 'Formulaire introuvable ou inactif' });
        return true;
      }

      json(res, 200, {
        id: form.id,
        name: form.name,
        description: form.description,
        structure: form.structure,
        guildId: form.guildId,
      });
    } catch (err) {
      logger.error('PublicAPI', `Error fetching public custom form ${parts[3]}:`, err);
      json(res, 500, { error: 'Erreur lors du chargement du formulaire' });
    }
    return true;
  }

  // POST /api/public/custom-forms/:formId/submit - Submit custom form response (no auth)
  if (parts[2] === 'custom-forms' && parts[3] && parts[4] === 'submit' && method === 'POST') {
    const formId = parts[3];
    try {
      // @ts-expect-error - Prisma client needs to be regenerated by user to recognize customForm
      const form = await prisma.customForm.findFirst({
        where: { id: formId, isActive: true },
      });

      if (!form) {
        json(res, 404, { error: 'Formulaire introuvable ou inactif' });
        return true;
      }

      const body = await readJsonBody<{
        data: Record<string, string>;
        discordId?: string;
        email?: string;
        username?: string;
        userTag?: string;
      }>(req);

      if (!body?.data || typeof body.data !== 'object') {
        json(res, 400, { error: 'Les données de réponse sont requises' });
        return true;
      }

      const { submitCustomForm } = await import('../../services/features/customFormService.js');
      const submission = await submitCustomForm(
        formId,
        form.guildId,
        body.discordId || '',
        body.username || undefined,
        body.userTag || undefined,
        body.data,
        client
      );

      json(res, 201, { ok: true, id: submission.id });
    } catch (err) {
      logger.error('PublicAPI', `Error submitting custom form ${parts[3]}:`, err);
      json(res, 500, { error: 'Erreur lors de la soumission du formulaire' });
    }
    return true;
  }

  return false;
}


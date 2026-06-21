import { describe, expect, test, mock, beforeEach } from 'bun:test';
import path from 'node:path';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import jwt from 'jsonwebtoken';
import { type Client } from 'discord.js';

// Setup DB Mock before importing route modules
const mockDb = {
  memberProfile: {
    findUnique: mock(() => Promise.resolve<any>(null)),
    update: mock(() => Promise.resolve({})),
    findMany: mock(() => Promise.resolve([])),
  },
  guild: {
    findUnique: mock(() => Promise.resolve<any>(null)),
    findMany: mock(() => Promise.resolve([])),
  },
  newsArticle: {
    findMany: mock(() => Promise.resolve([])),
  },
  transcript: {
    findUnique: mock(() => Promise.resolve(null)),
  },
  globalAdmin: {
    findMany: mock(() => Promise.resolve([])),
    findUnique: mock(() => Promise.resolve(null)),
    upsert: mock(() => Promise.resolve({})),
    delete: mock(() => Promise.resolve({})),
  },
  sanction: {
    count: mock(() => Promise.resolve(0)),
    findMany: mock(() => Promise.resolve([])),
  },
  dailyAlgoSubmission: {
    count: mock(() => Promise.resolve(0)),
  },
  globalBlacklist: {
    findMany: mock(() => Promise.resolve([])),
    upsert: mock(() => Promise.resolve({})),
    delete: mock(() => Promise.resolve({})),
  },
  bannedWord: {
    findMany: mock(() => Promise.resolve([])),
    findFirst: mock(() => Promise.resolve(null)),
    create: mock(() => Promise.resolve({})),
    update: mock(() => Promise.resolve({})),
    delete: mock(() => Promise.resolve({})),
  },
  botGlobalConfig: {
    findUnique: mock(() => Promise.resolve(null)),
    upsert: mock(() => Promise.resolve({})),
  },
  botErrorLog: {
    findMany: mock(() => Promise.resolve([])),
    deleteMany: mock(() => Promise.resolve({})),
  },
  activationCode: {
    findMany: mock(() => Promise.resolve([])),
    create: mock(() => Promise.resolve({})),
    findUnique: mock(() => Promise.resolve(null)),
    update: mock(() => Promise.resolve({})),
  },
  dashboardAuditLog: {
    create: mock(() => Promise.resolve({})),
  },
  dashboardFeatureConfig: {
    findMany: mock(() => Promise.resolve([])),
    create: mock(() => Promise.resolve({})),
    findUnique: mock(() => Promise.resolve(null)),
    update: mock(() => Promise.resolve({})),
  },
};

const dbPath = path.resolve(import.meta.dir, '../../utils/db.ts');
const dbJsPath = path.resolve(import.meta.dir, '../../utils/db.js');

mock.module(dbPath, () => ({
  default: mockDb,
  prisma: mockDb,
}));

mock.module(dbJsPath, () => ({
  default: mockDb,
  prisma: mockDb,
}));

// Setup Guild Activation Mock
const mockActivation = {
  isGuildActivated: mock((guildId: string) => true),
  activateGuild: mock(() => Promise.resolve({})),
  deactivateGuild: mock(() => Promise.resolve({})),
};
const activationPath = path.resolve(import.meta.dir, '../../utils/activation.ts');
const activationJsPath = path.resolve(import.meta.dir, '../../utils/activation.js');

mock.module(activationPath, () => mockActivation);
mock.module(activationJsPath, () => mockActivation);

const mockMcpKeyService = {
  verifyMcpKey: mock(() => Promise.resolve(null)),
  verifyMcpKeyByClientCredentials: mock(() => Promise.resolve(null)),
  createMcpKey: mock(() => Promise.resolve({})),
  getMcpKeys: mock(() => Promise.resolve([])),
  deactivateMcpKey: mock(() => Promise.resolve({ count: 1 })),
};
const mcpKeyServicePath = path.resolve(import.meta.dir, '../../api/mcp/mcpKeyService.ts');
const mcpKeyServiceJsPath = path.resolve(import.meta.dir, '../../api/mcp/mcpKeyService.js');

mock.module(mcpKeyServicePath, () => mockMcpKeyService);
mock.module(mcpKeyServiceJsPath, () => mockMcpKeyService);

const mockMcpTools = {
  registerMcpTools: mock(() => undefined),
};
const mcpToolsPath = path.resolve(import.meta.dir, '../../api/mcp/mcpTools.ts');
const mcpToolsJsPath = path.resolve(import.meta.dir, '../../api/mcp/mcpTools.js');

mock.module(mcpToolsPath, () => mockMcpTools);
mock.module(mcpToolsJsPath, () => mockMcpTools);

// Import router modules and helpers after mocks are set up
import {
  json,
  JWT_SECRET,
  splitPath,
} from '../../api/shared.js';
import { handlePublicRoutes } from '../../api/routes/public.js';
import { handleAuthRoutes } from '../../api/routes/auth.js';
import { handleReportErrorRoute } from '../../api/routes/error.js';
import { handleUserRoutes } from '../../api/routes/user.js';
import { handleAdminRoutes } from '../../api/routes/admin.js';
import { handleDashboardRoutes } from '../../api/routes/dashboard.js';
import { handleMCPRoutes } from '../../api/mcp/mcpServer.js';

// Helper mock req/res functions
function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = options.method || 'GET';
  req.url = options.url || '/';
  req.headers = options.headers || {};
  if (options.body) {
    (req as IncomingMessage & { bodyText?: string }).bodyText = options.body;
    req.push(options.body);
    req.push(null);
  } else {
    (req as IncomingMessage & { bodyText?: string }).bodyText = '';
    req.push(null);
  }
  return req;
}

interface MockResponse extends ServerResponse {
  body: string;
}

function createMockResponse(): MockResponse {
  const socket = new Socket();
  const res = new ServerResponse(new IncomingMessage(socket)) as MockResponse;
  
  let _statusCode = 200;
  let _body = '';
  const _headers: Record<string, string> = {};

  Object.defineProperty(res, 'statusCode', {
    get: () => _statusCode,
    set: (code: number) => {
      _statusCode = code;
    }
  });

  res.setHeader = (name: string, value: any) => {
    _headers[name.toLowerCase()] = String(value);
    return res;
  };

  res.getHeader = (name: string) => {
    return _headers[name.toLowerCase()];
  };

  res.writeHead = (statusCode: number, headers?: any) => {
    _statusCode = statusCode;
    if (headers) {
      for (const key of Object.keys(headers)) {
        res.setHeader(key, headers[key]);
      }
    }
    return res;
  };

  res.write = (chunk: any) => {
    _body += chunk.toString();
    return true;
  };

  res.end = (chunk?: any) => {
    if (chunk) {
      _body += chunk.toString();
    }
    (res as any).finished = true;
    res.body = _body;
    return res;
  };

  return res;
}

// Mock Discord Client
const mockClient = {
  users: {
    fetch: mock((userId: string) => Promise.resolve({
      id: userId,
      tag: 'TestUser#1234',
      username: 'TestUser',
      globalName: 'Test User',
      displayAvatarURL: () => 'http://example.com/avatar.png',
      accentColor: 0xff0000,
      createdAt: new Date(),
      bot: false,
    })),
  },
  guilds: {
    cache: {
      get: mock((guildId: string) => ({
        id: guildId,
        name: 'Test Guild',
        memberCount: 100,
        roles: {
          cache: {
            get: () => null,
          },
        },
        channels: {
          cache: {
            get: mock((channelId: string) => ({
              id: channelId,
              isTextBased: () => true,
              send: mock((options: any) => Promise.resolve({ id: 'sent-msg-id', ...options })),
              messages: {
                fetch: mock((messageId: string) => Promise.resolve({
                  id: messageId,
                  edit: mock((options: any) => Promise.resolve({ id: messageId, ...options })),
                })),
              },
            })),
            values: () => [],
          },
        },
        members: {
          fetch: mock(() => Promise.resolve({
            id: '123456789012345678',
            roles: {
              cache: new Map(),
            },
            permissions: {
              has: () => true,
            },
          })),
        },
      })),
      find: mock(() => null),
      first: mock(() => ({ id: 'fallback-guild' })),
    },
    fetch: mock((guildId: string) => Promise.resolve({
      id: guildId,
      name: 'Test Guild',
      memberCount: 100,
    })),
  },
} as unknown as Client;

describe('Modular Routers Unit Tests', () => {
  let testUserToken: string;

  beforeEach(() => {
    // Reset all mock functions
    mockDb.memberProfile.findUnique.mockClear();
    mockDb.memberProfile.update.mockClear();
    mockDb.memberProfile.findMany.mockClear();
    mockDb.guild.findUnique.mockClear();
    mockDb.guild.findMany.mockClear();
    mockDb.newsArticle.findMany.mockClear();
    mockDb.transcript.findUnique.mockClear();
    mockDb.globalAdmin.findMany.mockClear();
    mockDb.globalAdmin.findUnique.mockClear();
    mockDb.sanction.count.mockClear();
    mockDb.sanction.findMany.mockClear();
    mockDb.dailyAlgoSubmission.count.mockClear();
    mockDb.globalBlacklist.findMany.mockClear();
    mockDb.globalBlacklist.upsert.mockClear();
    mockDb.globalBlacklist.delete.mockClear();
    mockDb.bannedWord.findMany.mockClear();
    mockDb.bannedWord.findFirst.mockClear();
    mockDb.bannedWord.create.mockClear();
    mockDb.bannedWord.update.mockClear();
    mockDb.bannedWord.delete.mockClear();
    mockDb.botGlobalConfig.findUnique.mockClear();
    mockDb.botGlobalConfig.upsert.mockClear();
    mockDb.botErrorLog.findMany.mockClear();
    mockDb.botErrorLog.deleteMany.mockClear();
    mockDb.activationCode.findMany.mockClear();
    mockDb.activationCode.create.mockClear();
    mockDb.activationCode.findUnique.mockClear();
    mockDb.activationCode.update.mockClear();
    mockDb.dashboardAuditLog.create.mockClear();
    mockDb.dashboardFeatureConfig.findMany.mockClear();
    mockDb.dashboardFeatureConfig.create.mockClear();
    mockDb.dashboardFeatureConfig.findUnique.mockClear();
    mockDb.dashboardFeatureConfig.update.mockClear();
    mockMcpKeyService.verifyMcpKey.mockClear();
    mockMcpKeyService.verifyMcpKeyByClientCredentials.mockClear();
    mockMcpKeyService.createMcpKey.mockClear();
    mockMcpKeyService.getMcpKeys.mockClear();
    mockMcpKeyService.deactivateMcpKey.mockClear();

    mockActivation.isGuildActivated.mockClear();
    mockActivation.activateGuild.mockClear();
    mockActivation.deactivateGuild.mockClear();

    testUserToken = jwt.sign(
      { userId: '123456789012345678', username: 'TestUser' },
      JWT_SECRET!
    );
  });

  describe('1. Public Routes', () => {
    test('GET /health returns service status', async () => {
      const req = createMockRequest({ method: 'GET', url: '/health' });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handlePublicRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBeTrue();
      expect(data.service).toBe('kotbo-dashboard-api');
    });

    test('GET /api/config returns client info', async () => {
      const req = createMockRequest({ method: 'GET', url: '/api/config' });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      // Set client ID to bypass empty checks
      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_REDIRECT_URI = 'http://localhost';

      const handled = await handlePublicRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      const { DISCORD_CLIENT_ID: actualClientId } = await import('../../api/shared.js');
      expect(data.discordClientId).toBe(actualClientId);
    });

    test('GET root OAuth discovery refuses templated MCP endpoints', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/.well-known/oauth-authorization-server',
        headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'api-kotbo.example' },
      });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handlePublicRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error).toBe('guild_scoped_mcp_endpoint_required');
      expect(data.endpoint_format).toBe('https://api-kotbo.example/api/mcp/:guildId');
    });

    test('GET standard MCP protected resource metadata returns guild-scoped issuer', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/.well-known/oauth-protected-resource/api/mcp/112233445566778899',
        headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'api-kotbo.example' },
      });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handlePublicRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.resource).toBe('https://api-kotbo.example/api/mcp/112233445566778899');
      expect(data.authorization_servers).toEqual(['https://api-kotbo.example/api/mcp/112233445566778899']);
    });

    test('GET standard MCP authorization server metadata returns concrete endpoints', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/.well-known/oauth-authorization-server/api/mcp/112233445566778899',
        headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'api-kotbo.example' },
      });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handlePublicRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.issuer).toBe('https://api-kotbo.example/api/mcp/112233445566778899');
      expect(data.authorization_endpoint).toBe('https://api-kotbo.example/api/mcp/112233445566778899/oauth/authorize');
      expect(data.token_endpoint).toBe('https://api-kotbo.example/api/mcp/112233445566778899/oauth/token');
      expect(data.authorization_endpoint).not.toContain('{guildId}');
    });
  });

  describe('1b. MCP OAuth Routes', () => {
    test('rejects encoded guildId template from OAuth discovery', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/api/mcp/%7BguildId%7D/oauth/authorize?client_id=test&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=abc',
      });
      const res = createMockResponse();
      const parts = splitPath(new URL(req.url!, 'http://localhost').pathname);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handleMCPRoutes(req as IncomingMessage & { bodyText?: string }, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error).toBe('invalid_guild_id');
    });

    test('OAuth authorize page overrides global CSP so inline CSS can render', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/api/mcp/112233445566778899/oauth/authorize?client_id=test&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=abc',
      });
      const res = createMockResponse();
      const parts = splitPath(new URL(req.url!, 'http://localhost').pathname);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handleMCPRoutes(req as IncomingMessage & { bodyText?: string }, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(200);
      expect(res.getHeader('content-security-policy')).toContain("style-src 'unsafe-inline'");
      expect(res.getHeader('content-type')).toContain('text/html');
      expect(res.body).toContain('<style>');
    });

    test('OAuth token endpoint supports client_credentials with MCP key client ID and secret', async () => {
      const clientId = 'mcp-key-id';
      const clientSecret = 'mcp_test_secret';
      mockMcpKeyService.verifyMcpKeyByClientCredentials.mockImplementation(() => Promise.resolve({
        id: clientId,
        guildId: '112233445566778899',
        isActive: true,
      } as any));

      const req = createMockRequest({
        method: 'POST',
        url: '/api/mcp/112233445566778899/oauth/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });
      const res = createMockResponse();
      const parts = splitPath(new URL(req.url!, 'http://localhost').pathname);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handleMCPRoutes(req as IncomingMessage & { bodyText?: string }, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.access_token).toBe(clientSecret);
      expect(data.token_type).toBe('Bearer');
    });
  });

  describe('2. Auth Routes', () => {
    test('GET /api/auth/discord/login redirects to Discord authorize', async () => {
      const req = createMockRequest({ method: 'GET', url: '/api/auth/discord/login' });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      process.env.DISCORD_CLIENT_ID = 'test-client-id';
      process.env.DISCORD_REDIRECT_URI = 'http://localhost/callback';

      const handled = await handleAuthRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(302);
      expect(res.getHeader('location')).toContain('discord.com/api/oauth2/authorize');
    });
  });

  describe('3. Error Routes', () => {
    test('POST /api/report-error returns 400 for invalid payload', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/report-error',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handleReportErrorRoute(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(400);
    });
  });

  describe('4. User Routes', () => {
    test('GET /api/user/me returns user info when authenticated', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/api/user/me',
        headers: { authorization: `Bearer ${testUserToken}` },
      });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handleUserRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.id).toBe('123456789012345678');
      expect(data.username).toBe('TestUser');
    });
  });

  describe('5. Admin Routes', () => {
    test('GET /api/admin/stats is blocked without admin access', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/api/admin/stats',
        headers: { authorization: `Bearer ${testUserToken}` },
      });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      // Mock resolvesAdminAccess to false
      mockDb.globalAdmin.findUnique.mockResolvedValue(null);

      const handled = await handleAdminRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(403);
    });
  });

  describe('6. Dashboard Router dispatcher', () => {
    test('Bypasses auth for recruitment webhook', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/dashboard/guilds/1122334455667788/recruitment/candidatures',
        body: JSON.stringify({ data: { name: 'Applicant' } }),
      });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handleDashboardRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.body);
      expect(data.error).toBe('Non authentifié');
    });

    test('Requires user authentication for general guild settings', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/api/dashboard/guilds/1122334455667788/state',
      });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handleDashboardRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(401);
    });

    test('GET /api/dashboard/guilds/:guildId/notifications/features returns 200', async () => {
      // Mock db feature configs and guild info
      mockDb.guild.findUnique.mockResolvedValue({ id: '1122334455667788', dailyAlgoEnabled: true });
      mockDb.dashboardFeatureConfig.findMany.mockResolvedValue([]);
      
      const req = createMockRequest({
        method: 'GET',
        url: '/api/dashboard/guilds/1122334455667788/notifications/features',
        headers: { authorization: `Bearer ${testUserToken}` },
      });
      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handleDashboardRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.features).toBeDefined();
    });

    test('POST /api/dashboard/guilds/:guildId/embed-builder parses content and V2 embed fields', async () => {
      mockDb.guild.findUnique.mockResolvedValue({ id: '1122334455667788' });
      mockDb.dashboardFeatureConfig.findMany.mockResolvedValue([]);

      const payload = {
        channelId: '12345678',
        content: 'This is test content outside the embed',
        embed: {
          title: 'V2 Title',
          description: 'V2 Description',
          color: '#ff0000',
          url: 'https://title-url.com',
          authorName: 'V2 Author',
          authorUrl: 'https://author-url.com',
          timestamp: true,
        },
      };

      const req = createMockRequest({
        method: 'POST',
        url: '/api/dashboard/guilds/1122334455667788/embed-builder',
        headers: {
          authorization: `Bearer ${testUserToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const res = createMockResponse();
      const parts = splitPath(req.url!);
      const url = new URL(req.url!, 'http://localhost');

      const handled = await handleDashboardRoutes(req, res, parts, url, mockClient);
      expect(handled).toBeTrue();
      expect(res.statusCode).toBe(200);

      const data = JSON.parse(res.body);
      expect(data.ok).toBeTrue();
      expect(data.messageId).toBe('sent-msg-id');
    });
  });
});

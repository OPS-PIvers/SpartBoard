// The Claude connector's MCP endpoint: stateless Streamable HTTP with JSON responses (plan: "Architecture").
import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import '../functionsInit';
import {
  DAILY_CALL_LIMIT_PER_INSTANCE,
  STATUS_CACHE_MS,
  publicOrigin,
  resourceMetadataUrl,
} from './config';
import { verifyAccessToken, type AccessClaims } from './tokens';
import { isConnectorFeatureGranted } from './eligibility';
import { grantRef } from './grants';
import { BoundedLruMap } from '../utils/boundedLruMap';
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
} from '../secrets';

type Firestore = admin.firestore.Firestore;
type Response = Parameters<Parameters<typeof onRequest>[0]>[1];

const statusCache = new BoundedLruMap<string, { ok: boolean; at: number }>(
  2000
);
const callCounts = new BoundedLruMap<string, { day: string; count: number }>(
  5000
);

/** Grant still live and the gate still open; cached per instance so a normal call reads nothing (CC-D16). */
export async function isGrantActive(
  db: Firestore,
  claims: AccessClaims,
  now = Date.now()
): Promise<boolean> {
  const key = `${claims.uid}/${claims.grantId}`;
  const hit = statusCache.get(key);
  if (hit && now - hit.at < STATUS_CACHE_MS) return hit.ok;
  const grant = await grantRef(db, claims.uid, claims.grantId).get();
  const ok =
    grant.exists &&
    grant.get('revokedAt') == null &&
    (await isConnectorFeatureGranted(db, claims.email, claims.uid));
  statusCache.set(key, { ok, at: now });
  return ok;
}

/** In-memory per-instance ceiling on calls per teacher per day (CC-D16). */
export function takeCall(uid: string, now = Date.now()): boolean {
  const day = new Date(now).toISOString().slice(0, 10);
  const entry = callCounts.get(uid);
  const count = entry && entry.day === day ? entry.count : 0;
  if (count >= DAILY_CALL_LIMIT_PER_INSTANCE) return false;
  callCounts.set(uid, { day, count: count + 1 });
  return true;
}

function unauthorized(res: Response, description: string): void {
  res
    .status(401)
    .set(
      'WWW-Authenticate',
      `Bearer resource_metadata="${resourceMetadataUrl()}", error="invalid_token", error_description="${description}"`
    )
    .json({ error: 'invalid_token', error_description: description });
}

export const mcpServer = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
    concurrency: 40,
    invoker: 'public',
    // Drive-backed tools refresh the teacher's stored Google grant.
    secrets: [
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
    ],
  },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID'
    );
    res.set(
      'Access-Control-Expose-Headers',
      'WWW-Authenticate, Mcp-Session-Id'
    );
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const db = admin.firestore();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      unauthorized(res, 'Sign in to SpartBoard to continue');
      return;
    }
    const claims = await verifyAccessToken(db, token);
    if (!claims) {
      unauthorized(res, 'Token expired or invalid');
      return;
    }
    if (!(await isGrantActive(db, claims))) {
      unauthorized(res, 'This SpartBoard connection was disconnected');
      return;
    }
    // Stateless server: no SSE stream to open and no session to delete.
    if (req.method !== 'POST') {
      res
        .status(405)
        .set('Allow', 'POST')
        .json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method not allowed.' },
          id: null,
        });
      return;
    }
    if (!takeCall(claims.uid)) {
      res.status(429).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Daily SpartBoard request limit reached.',
        },
        id: null,
      });
      return;
    }

    // Lazy: keeps the MCP SDK out of every other function's cold start.
    const [
      { McpServer },
      { StreamableHTTPServerTransport },
      { registerTools, SERVER_INSTRUCTIONS },
    ] = await Promise.all([
      import('@modelcontextprotocol/sdk/server/mcp.js'),
      import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
      import('./tools'),
    ]);
    const server = new McpServer(
      {
        name: 'spartboard',
        title: 'SpartBoard',
        version: '1.0.0',
        websiteUrl: publicOrigin(),
        icons: [
          {
            src: `${publicOrigin()}/icon-128.png`,
            mimeType: 'image/png',
            sizes: ['128x128'],
          },
        ],
      },
      { instructions: SERVER_INSTRUCTIONS }
    );
    registerTools(server, {
      db,
      uid: claims.uid,
      email: claims.email,
      grantId: claims.grantId,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcpServer] request failed', { uid: claims.uid, err });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        });
      }
    }
  }
);

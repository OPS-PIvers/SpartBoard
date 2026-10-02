// Claude connector constants (docs/plans/CLAUDE_CONNECTOR.md).

/** GlobalFeature id gating the connector (CC-D7). */
export const CONNECTOR_FEATURE_ID = 'claude-connector';

/** GlobalFeature id gating the Guided Learning tools inside the connector. */
export const GL_FEATURE_ID = 'claude-connector-guided-learning';

/** GlobalFeature id gating the meeting notes tools (MR-D21). */
export const MEETING_AI_FEATURE_ID = 'plc-meeting-ai-notes';

const ORIGIN_BY_PROJECT: Readonly<Record<string, string>> = {
  spartboard: 'https://spartboard.web.app',
  'spartboard-dev': 'https://spartboard-dev.web.app',
};

/** Public origin, pinned per project so a forwarded Host header can never change the issuer (CC-D13). */
export function publicOrigin(): string {
  const override = process.env.MCP_PUBLIC_ORIGIN;
  if (override) return override.replace(/\/+$/, '');
  const project = process.env.GCLOUD_PROJECT ?? '';
  return ORIGIN_BY_PROJECT[project] ?? `https://${project}.web.app`;
}

export const resourceUrl = (): string => `${publicOrigin()}/mcp`;
export const resourceMetadataUrl = (): string =>
  `${publicOrigin()}/.well-known/oauth-protected-resource/mcp`;

export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
/** A replayed refresh token inside this window is treated as a client retry, not theft. */
export const REFRESH_REUSE_GRACE_MS = 60 * 1000;
export const LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const STATUS_CACHE_MS = 60 * 1000;

export const DAILY_WRITE_LIMIT = 300;
export const DAILY_CALL_LIMIT_PER_INSTANCE = 2000;
export const PAGE_SIZE = 25;

export const SCOPE = 'spartboard';

/** Redirect URIs Claude uses (web/desktop/mobile), plus loopback for Claude Code and MCP Inspector. */
export function isAllowedRedirectUri(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === 'https:') {
    return (
      (url.host === 'claude.ai' || url.host === 'claude.com') &&
      url.pathname === '/api/mcp/auth_callback'
    );
  }
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  );
}

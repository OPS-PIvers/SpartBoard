/** Admin-curated `admin_settings/claude_connector_cimd` switch: Claude registers with its hosted client metadata document instead of DCR. */

export const CLAUDE_CONNECTOR_CIMD_SETTINGS_DOC = 'claude_connector_cimd';

export interface ClaudeConnectorCimdSettings {
  /** Off by default; read server-side by functions/src/mcp/cimd.ts. */
  enabled: boolean;
}

/** Only an explicit true turns it on. */
export function normalizeClaudeConnectorCimdSettings(
  raw: unknown
): ClaudeConnectorCimdSettings {
  if (!raw || typeof raw !== 'object') return { enabled: false };
  return { enabled: (raw as { enabled?: unknown }).enabled === true };
}

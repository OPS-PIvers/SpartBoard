/** Admin-curated `admin_settings/claude_managed_auth` kill switch for Enterprise Managed Auth on the Claude connector. */

export const CLAUDE_MANAGED_AUTH_SETTINGS_DOC = 'claude_managed_auth';

export interface ClaudeManagedAuthSettings {
  /** Off by default; read server-side by functions/src/mcp/switches.ts. */
  enabled: boolean;
}

/** Only an explicit true turns it on. */
export function normalizeClaudeManagedAuthSettings(
  raw: unknown
): ClaudeManagedAuthSettings {
  if (!raw || typeof raw !== 'object') return { enabled: false };
  return { enabled: (raw as { enabled?: unknown }).enabled === true };
}

/** Mirrors `isValidIssuerUrl` in functions/src/mcp/managedAuth.ts and the org rule. */
export function isValidManagedAuthIssuer(raw: string): boolean {
  if (raw.length > 300 || !/^https:\/\/[^\s?#@]+$/.test(raw)) return false;
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      !url.port &&
      url.hostname.includes('.') &&
      !url.hostname.startsWith('[') &&
      !/^[\d.]+$/.test(url.hostname) &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password &&
      !/\s/.test(raw)
    );
  } catch {
    return false;
  }
}

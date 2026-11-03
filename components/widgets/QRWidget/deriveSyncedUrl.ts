import type {
  QRConfig,
  TextConfig,
  WidgetConnection,
  WidgetData,
} from '@/types';
import { followLeaderId } from '@/utils/connectionEngine';
import { usesLegacyToggles } from '@/utils/legacyConnections';
import { LINK_LEADER_TYPES } from '@/utils/widgetShareLinks';

const stripHtml = (html: string): string => {
  if (typeof DOMParser === 'undefined') {
    // SSR-safe fallback: loop until stable to prevent partial-tag bypass
    // (e.g. <scr<script>ipt>).
    let result = html;
    let prev: string;
    do {
      prev = result;
      result = prev.replace(/<[^>]*>?/gm, '');
    } while (result !== prev);
    return result.replace(/[<>]/g, '');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body?.textContent || '';
};

/**
 * Cheap O(N) find: returns the raw (possibly HTML) content of the first Text
 * widget on the dashboard when sync is enabled, else undefined. Suitable to
 * call on every render — does no parsing.
 */
export const getSyncedTextContent = (
  config: QRConfig,
  widgets: WidgetData[] | undefined,
  // With Connections on: the Text widget this QR Follows (null for none); undefined keeps the old toggle.
  followedTextId?: string | null
): string | undefined => {
  if (followedTextId === null) return undefined;
  if (followedTextId === undefined && !config.syncWithTextWidget) {
    return undefined;
  }
  const textWidget = widgets?.find((w) =>
    followedTextId ? w.id === followedTextId : w.type === 'text'
  );
  return (textWidget?.config as TextConfig | undefined)?.content;
};

/**
 * Expensive: runs DOMParser-based HTML stripping. Memoize on the raw content
 * string so this doesn't fire on every frame of drag/resize.
 */
export const extractSyncedUrl = (
  rawContent: string | undefined
): string | undefined => {
  if (!rawContent) return undefined;
  return stripHtml(rawContent).trim() || undefined;
};

/**
 * Convenience helper: composes getSyncedTextContent + extractSyncedUrl.
 * Used by the Settings panel where perf is not critical (only renders when
 * the user opens settings). The QR Widget itself splits the two passes for
 * memoization — see Widget.tsx.
 *
 * This is the single source of truth for sync derivation. The value is
 * derived live and never written back to Firestore.
 */
export const deriveSyncedUrl = (
  config: QRConfig,
  widgets: WidgetData[] | undefined,
  followedTextId?: string | null
): string | undefined =>
  extractSyncedUrl(getSyncedTextContent(config, widgets, followedTextId));

export interface QRSource {
  /** The Text widget to read (null for none); undefined keeps the old toggle. */
  followedTextId: string | null | undefined;
  /** An Activity Wall or Mini App this QR Follows for its student link. */
  linkLeaderId?: string;
}

export const resolveQRSource = (
  connectionsOn: boolean,
  connections: WidgetConnection[] | undefined,
  widgets: WidgetData[],
  widgetId: string,
  config: QRConfig
): QRSource => {
  const leaderId = connectionsOn
    ? followLeaderId(connections, widgets, widgetId)
    : undefined;
  const leader = leaderId ? widgets.find((w) => w.id === leaderId) : undefined;
  if (leader && LINK_LEADER_TYPES.has(leader.type)) {
    return { followedTextId: null, linkLeaderId: leader.id };
  }
  // A Follow wins; otherwise the old toggle applies unless this widget was migrated.
  return {
    followedTextId:
      leaderId ?? (usesLegacyToggles(connectionsOn, config) ? undefined : null),
  };
};

import { useInSubShare, useShareContent } from '@/hooks/useShareContent';
import type {
  SubShareCustomWidgetPayload,
  SubShareCustomWidgetView,
} from '@/types';

export interface SubShareCustomWidget {
  /** False everywhere but `/subs`, where the caller must use this instead. */
  active: boolean;
  doc: SubShareCustomWidgetView | null;
  loading: boolean;
}

/**
 * A custom widget's definition doc inside a sub share.
 *
 * A substitute cannot read a beta-gated `custom_widgets` doc — its rule needs
 * the reader's email in the widget's `betaUsers`. The definition is bundled at
 * share time so the sub sees the same widget the teacher placed.
 */
export function useSubShareCustomWidget(
  customWidgetId: string | null | undefined
): SubShareCustomWidget {
  const inShare = useInSubShare();
  const bundled = useShareContent<SubShareCustomWidgetPayload>(
    'customWidget',
    customWidgetId
  );
  return {
    active: inShare,
    doc: bundled.payload?.doc ?? null,
    loading: bundled.status === 'loading',
  };
}

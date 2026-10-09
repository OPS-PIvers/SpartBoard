import { useEffect, useLayoutEffect, useRef } from 'react';
import type { TourMaterialKind } from '@/types';

export const TOUR_OPEN_MATERIAL_EVENT = 'spart:tour-open-material';

export interface TourOpenMaterialRequest {
  widgetId: string;
  kind: TourMaterialKind;
  itemId: string;
}

/** Asks a widget to open one of its library items in its editor. */
export const requestOpenTourMaterial = (req: TourOpenMaterialRequest): void => {
  window.dispatchEvent(
    new CustomEvent<TourOpenMaterialRequest>(TOUR_OPEN_MATERIAL_EVENT, {
      detail: req,
    })
  );
};

const openNow = new Map<string, { kind: TourMaterialKind; itemId: string }>();

/** The library item each widget has open in its editor, by widget id. */
export const getOpenTourMaterials = (): ReadonlyMap<
  string,
  { kind: TourMaterialKind; itemId: string }
> => openNow;

/** Lets a tour open this widget's editor on an item, and see which item it has open. */
export function useTourMaterialEditor(
  widgetId: string,
  kind: TourMaterialKind,
  openItemId: string | null | undefined,
  open: (itemId: string) => void
): void {
  const openRef = useRef(open);
  useLayoutEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    const onOpen = (e: Event) => {
      const req = (e as CustomEvent<TourOpenMaterialRequest>).detail;
      if (req.widgetId === widgetId && req.kind === kind)
        openRef.current(req.itemId);
    };
    window.addEventListener(TOUR_OPEN_MATERIAL_EVENT, onOpen);
    return () => window.removeEventListener(TOUR_OPEN_MATERIAL_EVENT, onOpen);
  }, [widgetId, kind]);
  useEffect(() => {
    if (openItemId) openNow.set(widgetId, { kind, itemId: openItemId });
    else openNow.delete(widgetId);
    return () => {
      openNow.delete(widgetId);
    };
  }, [widgetId, kind, openItemId]);
}

import { useCallback, useMemo, useState } from 'react';
import {
  PAPER_MARKUP_MAX_COMMENT_CHARS,
  PAPER_MARKUP_MAX_ITEMS,
  type PaperMarkupColor,
  type PaperMarkupItem,
  type PaperMarkupStamp,
  type PaperPointMm,
  type PaperRectMm,
} from '@/types';
import {
  cropViewportMm,
  numberMarkupComments,
} from '@/utils/paperMarkupRender';
import { defaultMarkupColor, markupColorOf } from './markupStyle';
import {
  isBigEnough,
  isRectItem,
  moveItem,
  newMarkupId,
  placePoint,
  rectFromCorners,
  resizeItem,
  roundRectMm,
  type ResizeCorner,
} from './markupGeometry';
import { useMarkupHistory, type MarkupHistory } from './useMarkupHistory';
import type { DrawTool, MarkupTool, PaperMarkupBinding } from './types';

/** Screen pixels a press may wander and still count as a click. */
export const CLICK_SLOP_PX = 4;
/** Arrow-key nudge, and with Shift. */
export const NUDGE_MM = 0.5;
export const NUDGE_FAR_MM = 5;

export interface MarkupPress {
  mm: PaperPointMm;
  client: PaperPointMm;
  pointerId: number;
  hitItemId: string | null;
  hitCorner: ResizeCorner | null;
}

type Drag =
  | {
      kind: 'draw';
      pointerId: number;
      tool: DrawTool;
      start: PaperPointMm;
      cur: PaperPointMm;
      client: PaperPointMm;
      far: boolean;
      hitItemId: string | null;
    }
  | {
      kind: 'tap';
      pointerId: number;
      tool: 'stamp' | 'pin';
      at: PaperPointMm;
    }
  | {
      kind: 'move';
      pointerId: number;
      start: PaperPointMm;
      client: PaperPointMm;
      far: boolean;
      item: PaperMarkupItem;
      preview: PaperMarkupItem;
    }
  | {
      kind: 'resize';
      pointerId: number;
      start: PaperPointMm;
      corner: ResizeCorner;
      item: Extract<PaperMarkupItem, { rectMm: PaperRectMm }>;
      preview: PaperMarkupItem;
    };

/** The comment popover: an item's comment, or a pin not yet placed. */
export type CommentEdit =
  | { target: 'item'; id: string; text: string }
  | { target: 'pending-pin'; at: PaperPointMm; text: string };

export interface PaperMarkupEditor {
  viewport: PaperRectMm;
  /** Items as drawn right now, with any drag applied. */
  shown: readonly PaperMarkupItem[];
  /** The shape being drawn, before it becomes an item. */
  draft: PaperMarkupItem | null;
  numbers: ReadonlyMap<string, number>;
  tool: MarkupTool;
  setTool: (tool: MarkupTool) => void;
  /** A saved comment the pin tool drops on the next click, or null. */
  armedComment: string | null;
  /** Arms the pin tool with a saved comment; the next click drops a pin that carries it. */
  armComment: (text: string) => void;
  /** Removes every mark in one step, so undo brings them back. */
  clearAll: () => void;
  stamp: PaperMarkupStamp;
  setStamp: (stamp: PaperMarkupStamp) => void;
  color: PaperMarkupColor;
  setColor: (color: PaperMarkupColor) => void;
  selectedId: string | null;
  selected: PaperMarkupItem | null;
  select: (id: string | null) => void;
  atCap: boolean;
  dragging: boolean;
  history: MarkupHistory;
  deleteSelected: () => void;
  comment: CommentEdit | null;
  openComment: (id: string) => void;
  setCommentText: (text: string) => void;
  saveComment: () => void;
  cancelComment: () => void;
  press: (p: MarkupPress) => boolean;
  drag: (pointerId: number, mm: PaperPointMm, client: PaperPointMm) => void;
  release: (pointerId: number, mm: PaperPointMm, client: PaperPointMm) => void;
  cancelDrag: () => boolean;
  /** Drops a stamp or opens a pin at the middle of the crop, for keyboard users. */
  placeAtCentre: () => boolean;
  nudge: (dx: number, dy: number) => boolean;
  /** Escape: the in-progress shape, then the selection, then the tool. */
  escape: () => boolean;
}

const far = (a: PaperPointMm, b: PaperPointMm) =>
  Math.hypot(a.x - b.x, a.y - b.y) > CLICK_SLOP_PX;

const withColor = <T extends PaperMarkupItem>(
  item: T,
  color: PaperMarkupColor
): T => {
  const next = { ...item };
  if (color === defaultMarkupColor(item.kind)) delete next.color;
  else next.color = color;
  return next;
};

// The corner follows the pointer's travel, so grabbing a handle never makes the shape jump.
const resizeBy = (
  d: Extract<Drag, { kind: 'resize' }>,
  mm: PaperPointMm,
  view: PaperRectMm
) => {
  const r = d.item.rectMm;
  const west = d.corner === 'nw' || d.corner === 'sw';
  const north = d.corner === 'nw' || d.corner === 'ne';
  const corner = { x: west ? r.x : r.x + r.w, y: north ? r.y : r.y + r.h };
  return resizeItem(
    d.item,
    d.corner,
    { x: corner.x + mm.x - d.start.x, y: corner.y + mm.y - d.start.y },
    view
  );
};

const withComment = (item: PaperMarkupItem, text: string): PaperMarkupItem => {
  if (item.kind === 'pin' || text) return { ...item, comment: text };
  const next = { ...item };
  delete next.comment;
  return next;
};

const cleanComment = (text: string) =>
  text.trim().slice(0, PAPER_MARKUP_MAX_COMMENT_CHARS);

/** All editor state for one answer; the caller keys it per response and question. */
export function usePaperMarkupEditor(
  binding: PaperMarkupBinding | undefined,
  boxMm: PaperRectMm | null
): PaperMarkupEditor {
  const items = binding?.items ?? EMPTY;
  const onChange = binding?.onChange ?? noop;
  const history = useMarkupHistory(items, onChange);
  const viewport = useMemo(
    () => (boxMm ? cropViewportMm(boxMm) : ZERO_RECT),
    [boxMm]
  );

  const [toolPick, setToolPick] = useState<MarkupTool>('select');
  const [stamp, setStampPick] = useState<PaperMarkupStamp>('check');
  const [inkColor, setInkColor] = useState<PaperMarkupColor>('red');
  const [highlightColor, setHighlightColor] =
    useState<PaperMarkupColor>('yellow');
  const [armedPick, setArmedPick] = useState<string | null>(null);
  const [selectedPick, setSelectedId] = useState<string | null>(null);
  const [dragState, setDrag] = useState<Drag | null>(null);
  const [comment, setComment] = useState<CommentEdit | null>(null);

  const atCap = items.length >= PAPER_MARKUP_MAX_ITEMS;
  const tool: MarkupTool = atCap ? 'select' : toolPick;
  const armedComment = tool === 'pin' ? armedPick : null;
  // An undo can remove the selected item out from under the selection.
  const selected = items.find((i) => i.id === selectedPick) ?? null;
  const selectedId = selected?.id ?? null;

  const shown = useMemo(() => {
    if (dragState?.kind !== 'move' && dragState?.kind !== 'resize')
      return items;
    const preview = dragState.preview;
    return items.map((i) => (i.id === preview.id ? preview : i));
  }, [items, dragState]);

  const draft = useMemo<PaperMarkupItem | null>(() => {
    if (dragState?.kind !== 'draw' || !dragState.far) return null;
    return {
      id: 'draft',
      kind: dragState.tool,
      rectMm: rectFromCorners(dragState.start, dragState.cur, viewport),
      ...(dragState.tool === 'highlight'
        ? { color: highlightColor }
        : { color: inkColor }),
    };
  }, [dragState, viewport, highlightColor, inkColor]);

  const numbers = useMemo(
    () => new Map(numberMarkupComments(shown).map((c) => [c.itemId, c.number])),
    [shown]
  );

  const color: PaperMarkupColor = selected
    ? markupColorOf(selected)
    : tool === 'highlight'
      ? highlightColor
      : inkColor;

  const commit = history.commit;

  const replaceItem = useCallback(
    (next: PaperMarkupItem) =>
      commit(items.map((i) => (i.id === next.id ? next : i))),
    [commit, items]
  );

  const add = useCallback(
    (item: PaperMarkupItem) => {
      if (items.length >= PAPER_MARKUP_MAX_ITEMS) return false;
      commit([...items, item]);
      return true;
    },
    [commit, items]
  );

  const setTool = useCallback((next: MarkupTool) => {
    setToolPick(next);
    setArmedPick(null);
    setComment(null);
    if (next !== 'select') setSelectedId(null);
  }, []);

  const armComment = useCallback((text: string) => {
    setToolPick('pin');
    setArmedPick(text.trim().slice(0, PAPER_MARKUP_MAX_COMMENT_CHARS) || null);
    setComment(null);
    setSelectedId(null);
  }, []);

  const clearAll = useCallback(() => {
    if (items.length === 0) return;
    commit([]);
    setSelectedId(null);
    setComment(null);
  }, [commit, items.length]);

  const setStamp = useCallback(
    (next: PaperMarkupStamp) => {
      setStampPick(next);
      setTool('stamp');
    },
    [setTool]
  );

  const setColor = useCallback(
    (next: PaperMarkupColor) => {
      const kind =
        selected?.kind ?? (tool === 'highlight' ? 'highlight' : 'rect');
      if (kind === 'highlight') setHighlightColor(next);
      else setInkColor(next);
      if (selected && markupColorOf(selected) !== next)
        replaceItem(withColor(selected, next));
    },
    [selected, tool, replaceItem]
  );

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setComment(null);
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit(items.filter((i) => i.id !== selectedId));
    setSelectedId(null);
    setComment(null);
  }, [commit, items, selectedId]);

  const openComment = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      setSelectedId(id);
      setComment({ target: 'item', id, text: item.comment ?? '' });
    },
    [items]
  );

  const setCommentText = useCallback((text: string) => {
    setComment((c) =>
      c ? { ...c, text: text.slice(0, PAPER_MARKUP_MAX_COMMENT_CHARS) } : c
    );
  }, []);

  const saveComment = useCallback(() => {
    if (!comment) return;
    const text = cleanComment(comment.text);
    setComment(null);
    if (comment.target === 'pending-pin') {
      if (!text) return;
      add(
        withColor(
          { id: newMarkupId(), kind: 'pin', atMm: comment.at, comment: text },
          inkColor
        )
      );
      return;
    }
    const item = items.find((i) => i.id === comment.id);
    if (!item || (item.comment ?? '') === text) return;
    if (item.kind === 'pin' && !text) {
      commit(items.filter((i) => i.id !== item.id));
      setSelectedId(null);
      return;
    }
    replaceItem(withComment(item, text));
  }, [comment, add, inkColor, items, commit, replaceItem]);

  const cancelComment = useCallback(() => setComment(null), []);

  const press = useCallback(
    (p: MarkupPress): boolean => {
      // A press outside an open comment keeps what was typed, like Save.
      if (comment) {
        saveComment();
        return false;
      }
      const hit = p.hitItemId
        ? (items.find((i) => i.id === p.hitItemId) ?? null)
        : null;
      if (p.hitCorner && selected && isRectItem(selected)) {
        setDrag({
          kind: 'resize',
          pointerId: p.pointerId,
          start: p.mm,
          corner: p.hitCorner,
          item: selected,
          preview: selected,
        });
        return true;
      }
      if (tool === 'select') {
        if (!hit) {
          setSelectedId(null);
          return false;
        }
        setSelectedId(hit.id);
        setDrag({
          kind: 'move',
          pointerId: p.pointerId,
          start: p.mm,
          client: p.client,
          far: false,
          item: hit,
          preview: hit,
        });
        return true;
      }
      if (tool === 'stamp' || tool === 'pin') {
        setDrag({ kind: 'tap', pointerId: p.pointerId, tool, at: p.mm });
        return true;
      }
      setDrag({
        kind: 'draw',
        pointerId: p.pointerId,
        tool,
        start: p.mm,
        cur: p.mm,
        client: p.client,
        far: false,
        hitItemId: hit?.id ?? null,
      });
      return true;
    },
    [comment, saveComment, items, selected, tool]
  );

  const drag = useCallback(
    (pointerId: number, mm: PaperPointMm, client: PaperPointMm) => {
      setDrag((d) => {
        if (!d || d.pointerId !== pointerId) return d;
        switch (d.kind) {
          case 'draw':
            return { ...d, cur: mm, far: d.far || far(d.client, client) };
          case 'tap':
            return { ...d, at: mm };
          case 'move': {
            const isFar = d.far || far(d.client, client);
            if (!isFar) return d;
            const delta = { x: mm.x - d.start.x, y: mm.y - d.start.y };
            return {
              ...d,
              far: true,
              preview: moveItem(d.item, delta, viewport),
            };
          }
          case 'resize':
            return {
              ...d,
              preview: resizeBy(d, mm, viewport),
            };
        }
      });
    },
    [viewport]
  );

  const release = useCallback(
    (pointerId: number, mm: PaperPointMm, client: PaperPointMm) => {
      const d = dragState;
      if (!d || d.pointerId !== pointerId) return;
      setDrag(null);
      switch (d.kind) {
        case 'draw': {
          const rect = rectFromCorners(d.start, mm, viewport);
          if (!(d.far || far(d.client, client)) || !isBigEnough(rect)) {
            setSelectedId(d.hitItemId);
            return;
          }
          const item = withColor(
            {
              id: newMarkupId(),
              kind: d.tool,
              rectMm: roundRectMm(rect),
            },
            d.tool === 'highlight' ? highlightColor : inkColor
          );
          if (add(item)) setSelectedId(item.id);
          return;
        }
        case 'tap': {
          const at = placePoint(mm, d.tool, viewport);
          if (d.tool === 'pin' && armedComment) {
            const pinned = withColor(
              {
                id: newMarkupId(),
                kind: 'pin',
                atMm: at,
                comment: armedComment,
              },
              inkColor
            );
            add(pinned);
            return;
          }
          if (d.tool === 'pin') {
            setSelectedId(null);
            setComment({ target: 'pending-pin', at, text: '' });
            return;
          }
          const item = withColor(
            { id: newMarkupId(), kind: 'stamp', atMm: at, symbol: stamp },
            inkColor
          );
          if (add(item)) setSelectedId(item.id);
          return;
        }
        case 'move': {
          if (!(d.far || far(d.client, client))) return;
          const delta = { x: mm.x - d.start.x, y: mm.y - d.start.y };
          const moved = moveItem(d.item, delta, viewport);
          if (JSON.stringify(moved) !== JSON.stringify(d.item))
            replaceItem(moved);
          return;
        }
        case 'resize': {
          const sized = resizeBy(d, mm, viewport);
          if (JSON.stringify(sized) !== JSON.stringify(d.item))
            replaceItem(sized);
          return;
        }
      }
    },
    [
      dragState,
      viewport,
      add,
      highlightColor,
      inkColor,
      stamp,
      replaceItem,
      armedComment,
    ]
  );

  const cancelDrag = useCallback(() => {
    if (!dragState) return false;
    setDrag(null);
    return true;
  }, [dragState]);

  const placeAtCentre = useCallback(() => {
    if (tool !== 'stamp' && tool !== 'pin') return false;
    const at = placePoint(
      { x: viewport.x + viewport.w / 2, y: viewport.y + viewport.h / 2 },
      tool,
      viewport
    );
    if (tool === 'pin' && armedComment) {
      const pinned = withColor(
        { id: newMarkupId(), kind: 'pin', atMm: at, comment: armedComment },
        inkColor
      );
      add(pinned);
      return true;
    }
    if (tool === 'pin') {
      setComment({ target: 'pending-pin', at, text: '' });
      return true;
    }
    const item = withColor(
      { id: newMarkupId(), kind: 'stamp', atMm: at, symbol: stamp },
      inkColor
    );
    if (add(item)) setSelectedId(item.id);
    return true;
  }, [tool, viewport, stamp, inkColor, add, armedComment]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!selected) return false;
      replaceItem(moveItem(selected, { x: dx, y: dy }, viewport));
      return true;
    },
    [selected, replaceItem, viewport]
  );

  const escape = useCallback(() => {
    if (dragState) {
      setDrag(null);
      return true;
    }
    if (comment) {
      setComment(null);
      return true;
    }
    if (armedComment) {
      setArmedPick(null);
      return true;
    }
    if (selectedId) {
      setSelectedId(null);
      return true;
    }
    if (tool !== 'select') {
      setToolPick('select');
      return true;
    }
    return false;
  }, [dragState, comment, armedComment, selectedId, tool]);

  return {
    viewport,
    shown,
    draft,
    numbers,
    tool,
    setTool,
    armedComment,
    armComment,
    clearAll,
    stamp,
    setStamp,
    color,
    setColor,
    selectedId,
    selected,
    select,
    atCap,
    dragging: dragState !== null && dragState.kind !== 'tap',
    history,
    deleteSelected,
    comment,
    openComment,
    setCommentText,
    saveComment,
    cancelComment,
    press,
    drag,
    release,
    cancelDrag,
    placeAtCentre,
    nudge,
    escape,
  };
}

const EMPTY: readonly PaperMarkupItem[] = [];
const ZERO_RECT: PaperRectMm = { x: 0, y: 0, w: 1, h: 1 };
const noop = () => undefined;

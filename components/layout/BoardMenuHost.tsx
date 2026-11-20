import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import type { Dashboard } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useViewAsOutward } from '@/hooks/useViewAsOutward';
import { tourAttr } from '@/config/tourAnchors';
import { isFixed, isOffCanvas, tidy } from '@/utils/boardLayout';
import {
  Clipboard,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  Maximize2,
  Minimize2,
  PenLine,
  Redo2,
  Undo2,
} from 'lucide-react';
import { BoardBackgroundMenu, type BoardMenuItem } from './BoardBackgroundMenu';
import {
  isBoardBackgroundTarget,
  isMacPlatform,
  modKey,
  replayClipboardAsPaste,
} from './boardMenuUtils';

const BackgroundsModal = React.lazy(() =>
  import('@/components/backgroundsModal/BackgroundsModal').then((m) => ({
    default: m.BackgroundsModal,
  }))
);
const ShareLinkCreatorModal = React.lazy(() =>
  import('@/components/share/ShareLinkCreatorModal').then((m) => ({
    default: m.ShareLinkCreatorModal,
  }))
);

const GEOMETRY_KEYS = ['x', 'y', 'w', 'h'] as const;
// A deliberate hold: longer than the 600ms widget screenshot press, with a ring that fills while held.
const LONG_PRESS_MS = 700;
const MOVE_SLOP_PX = 10;
const LIFT_CLICK_MS = 400;

export const BoardMenuHost: React.FC = () => {
  const { t } = useTranslation();
  const { canAccessFeature } = useAuth();
  const outward = useViewAsOutward();
  const {
    activeDashboard,
    annotationActive,
    isActiveBoardReadOnly,
    undoWidgets,
    redoWidgets,
    canUndo,
    canRedo,
    minimizeAllWidgets,
    restoreAllWidgets,
    openAnnotation,
    recordWidgetSnapshot,
    updateWidget,
    shareDashboard,
    addToast,
  } = useDashboard();
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [pressAt, setPressAt] = useState<{ x: number; y: number } | null>(null);
  const [backgroundsOpen, setBackgroundsOpen] = useState(false);
  const [shareBoard, setShareBoard] = useState<Dashboard | null>(null);
  const [madeUrl, setMadeUrl] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenuAt(null), []);

  const blocked = annotationActive || isActiveBoardReadOnly;
  // The menu acts on one board, so a board switch or annotation/read-only drops it.
  const menuScope = `${activeDashboard?.id ?? ''}|${blocked}`;
  const [shownScope, setShownScope] = useState(menuScope);
  if (shownScope !== menuScope) {
    setShownScope(menuScope);
    setMenuAt(null);
  }
  useEffect(() => {
    if (blocked) return;
    let press: {
      id: number;
      x: number;
      y: number;
      timer: number;
      nativeMenu: boolean;
    } | null = null;
    // Lifting the finger that opened the menu can send a mouse click; it must not close the menu.
    let liftOf: number | null = null;
    let lift: { x: number; y: number; until: number } | null = null;
    // A Mac Ctrl+click may start a box selection, so its menu waits for a release that did not drag.
    let ctrlClick: { x: number; y: number } | null = null;
    const swallowLiftClick = (e: MouseEvent) => {
      if (!lift || performance.now() > lift.until) return;
      if (Math.hypot(e.clientX - lift.x, e.clientY - lift.y) > MOVE_SLOP_PX)
        return;
      e.stopPropagation();
      if (e.type === 'click') lift = null;
    };
    const cancel = () => {
      if (!press) return;
      window.clearTimeout(press.timer);
      press = null;
      setPressAt(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      // A second finger means pinch, pan or the two-finger gestures, never this menu.
      if (press) return cancel();
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      if (!isBoardBackgroundTarget(e.target)) return;
      const at = { x: e.clientX, y: e.clientY };
      press = {
        id: e.pointerId,
        ...at,
        nativeMenu: false,
        timer: window.setTimeout(() => {
          liftOf = press?.id ?? null;
          press = null;
          setPressAt(null);
          setMenuAt(at);
        }, LONG_PRESS_MS),
      };
      setPressAt(at);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_SLOP_PX)
        cancel();
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (liftOf !== null && e.pointerId === liftOf) {
        liftOf = null;
        lift = {
          x: e.clientX,
          y: e.clientY,
          until: performance.now() + LIFT_CLICK_MS,
        };
      }
      if (ctrlClick && e.pointerType === 'mouse') {
        const at = ctrlClick;
        ctrlClick = null;
        if (
          e.type === 'pointerup' &&
          Math.hypot(e.clientX - at.x, e.clientY - at.y) <= MOVE_SLOP_PX
        )
          setMenuAt(at);
      }
      if (!press || e.pointerId !== press.id) return;
      // Chrome can cancel the pointer once it shows its own long-press menu; ours still opens.
      if (e.type === 'pointercancel' && press.nativeMenu) return;
      cancel();
    };
    const onContextMenu = (e: MouseEvent) => {
      if (!isBoardBackgroundTarget(e.target)) return;
      e.preventDefault();
      const pointerType = (e as PointerEvent).pointerType;
      // Touch and pen open it from the long-press timer, so a held finger gets the same delay everywhere.
      if (pointerType === 'touch' || pointerType === 'pen') {
        if (press) press.nativeMenu = true;
        return;
      }
      if (e.ctrlKey && e.button === 0 && isMacPlatform()) {
        ctrlClick = { x: e.clientX, y: e.clientY };
        return;
      }
      setMenuAt({ x: e.clientX, y: e.clientY });
    };
    // Capture, so a widget that stops propagation still cancels a press with its second finger.
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerEnd, true);
    document.addEventListener('pointercancel', onPointerEnd, true);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mousedown', swallowLiftClick, true);
    window.addEventListener('click', swallowLiftClick, true);
    return () => {
      window.removeEventListener('mousedown', swallowLiftClick, true);
      window.removeEventListener('click', swallowLiftClick, true);
      cancel();
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerEnd, true);
      document.removeEventListener('pointercancel', onPointerEnd, true);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [blocked]);

  if (!activeDashboard) return null;
  const widgets = activeDashboard.widgets;
  const mod = modKey();

  const paste = async () => {
    try {
      if (!navigator.clipboard?.read) throw new Error('unsupported');
      const result = await replayClipboardAsPaste();
      if (result === 'empty') {
        addToast(
          t('boardMenu.toast.nothingToPaste', {
            defaultValue: 'Nothing to paste',
          }),
          'info'
        );
      }
    } catch {
      addToast(
        t('boardMenu.toast.pasteBlocked', {
          defaultValue: 'Press {{shortcut}} to paste',
          shortcut: `${mod}V`,
        }),
        'info'
      );
    }
  };

  const tidyUp = () => {
    const result = tidy(widgets, {
      w: window.innerWidth,
      h: window.innerHeight,
    });
    const moves = result.widgets.filter(
      (placed, i) =>
        !isFixed(widgets[i]) &&
        !isOffCanvas(widgets[i]) &&
        GEOMETRY_KEYS.some(
          (key) => Math.abs(placed[key] - widgets[i][key]) > 0.5
        )
    );
    if (moves.length > 0) {
      recordWidgetSnapshot();
      for (const placed of moves) {
        updateWidget(
          placed.id,
          {
            x: placed.x,
            y: placed.y,
            w: placed.w,
            h: placed.h,
            xProp: placed.xProp,
            yProp: placed.yProp,
            wProp: placed.wProp,
            hProp: placed.hProp,
          },
          { joinHistory: true }
        );
      }
    }
    if (result.unplaced.length > 0) {
      addToast(
        t('boardMenu.toast.tidyFull', {
          defaultValue: 'Some widgets did not fit. Close or shrink a few.',
        }),
        'info'
      );
    }
  };

  const copyBoardLink = async () => {
    // A View as session asks first, so it goes through the share dialog.
    if (outward.locked) return;
    if (outward.active) {
      setMadeUrl(null);
      setShareBoard(activeDashboard);
      return;
    }
    const linkPromise = shareDashboard(activeDashboard, 'copy').then(
      (shareId) => `${window.location.origin}/share/${shareId}`
    );
    try {
      // Handing the clipboard a promise keeps the click's permission while the link is made.
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': linkPromise.then(
              (url) => new Blob([url], { type: 'text/plain' })
            ),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(await linkPromise);
      }
      addToast(
        t('boardMenu.toast.linkCopied', {
          defaultValue:
            'Link copied. Anyone who opens it gets their own copy of this board.',
        }),
        'success'
      );
    } catch (err) {
      const created = await linkPromise.then(
        (url) => url,
        () => null
      );
      if (created) {
        // The link exists but the clipboard refused it; the dialog shows it to copy by hand.
        setMadeUrl(created);
        setShareBoard(activeDashboard);
      } else {
        console.error('Board copy link failed:', err);
        addToast(
          t('shareLinkCreatorModal.toast.createFailed', {
            defaultValue: 'Failed to create share link',
          }),
          'error'
        );
      }
    }
  };

  const onCanvas = widgets.filter((w) => !w.minimized);
  const tidyable = onCanvas.some((w) => !isFixed(w) && !w.maximized);
  const items: BoardMenuItem[] = [];
  if (canAccessFeature('smart-paste')) {
    items.push({
      id: 'paste',
      label: t('boardMenu.paste', { defaultValue: 'Paste' }),
      icon: Clipboard,
      tour: tourAttr('board-menu.paste'),
      shortcut: `${mod}V`,
      action: () => void paste(),
    });
  }
  items.push(
    {
      id: 'undo',
      label: t('boardMenu.undo', { defaultValue: 'Undo' }),
      icon: Undo2,
      tour: tourAttr('board-menu.undo'),
      shortcut: `${mod}Z`,
      disabled: !canUndo,
      groupStart: true,
      action: () => undoWidgets(activeDashboard.id),
    },
    {
      id: 'redo',
      label: t('boardMenu.redo', { defaultValue: 'Redo' }),
      icon: Redo2,
      tour: tourAttr('board-menu.redo'),
      shortcut: `${mod}Y`,
      disabled: !canRedo,
      action: () => redoWidgets(activeDashboard.id),
    },
    {
      id: 'tidy',
      label: t('boardMenu.tidy', { defaultValue: 'Tidy up' }),
      icon: LayoutGrid,
      tour: tourAttr('board-menu.tidy'),
      disabled: !tidyable,
      groupStart: true,
      action: tidyUp,
    }
  );
  if (onCanvas.length > 0) {
    items.push({
      id: 'minimize-all',
      label: t('boardMenu.minimizeAll', { defaultValue: 'Minimize all' }),
      icon: Minimize2,
      tour: tourAttr('board-menu.minimize-all'),
      action: minimizeAllWidgets,
    });
  }
  if (widgets.some((w) => w.minimized)) {
    items.push({
      id: 'restore-all',
      label: t('boardMenu.restoreAll', { defaultValue: 'Restore all' }),
      icon: Maximize2,
      tour: tourAttr('board-menu.restore-all'),
      action: restoreAllWidgets,
    });
  }
  items.push(
    {
      id: 'background',
      label: t('boardMenu.background', {
        defaultValue: 'Change background…',
      }),
      icon: ImageIcon,
      tour: tourAttr('board-menu.background'),
      groupStart: true,
      action: () => setBackgroundsOpen(true),
    },
    {
      id: 'draw',
      label: t('boardMenu.draw', { defaultValue: 'Draw on board' }),
      icon: PenLine,
      tour: tourAttr('board-menu.draw'),
      action: openAnnotation,
    }
  );
  if (canAccessFeature('dashboard-sharing') && !outward.locked) {
    items.push({
      id: 'copy-link',
      label: t('boardMenu.copyLink', { defaultValue: 'Copy board link' }),
      icon: Link2,
      tour: tourAttr('board-menu.copy-link'),
      groupStart: true,
      action: () => void copyBoardLink(),
    });
  }

  return (
    <>
      {pressAt && !blocked && (
        <div
          aria-hidden="true"
          className="fixed z-popover pointer-events-none w-16 h-16 -ml-8 -mt-8 rounded-full border-4 border-brand-blue-primary/70 bg-white/30 shadow-lg animate-in fade-in zoom-in-50 duration-500 delay-200 ease-linear fill-mode-both"
          style={{ left: pressAt.x, top: pressAt.y }}
        />
      )}
      {menuAt && !blocked && (
        <BoardBackgroundMenu
          position={menuAt}
          items={items}
          onClose={closeMenu}
        />
      )}
      <React.Suspense fallback={null}>
        {backgroundsOpen && (
          <BackgroundsModal isOpen onClose={() => setBackgroundsOpen(false)} />
        )}
        {shareBoard && (
          <ShareLinkCreatorModal
            dashboard={shareBoard}
            isOpen
            initialMode="copy"
            initialUrl={madeUrl}
            onClose={() => {
              setShareBoard(null);
              setMadeUrl(null);
            }}
          />
        )}
      </React.Suspense>
    </>
  );
};

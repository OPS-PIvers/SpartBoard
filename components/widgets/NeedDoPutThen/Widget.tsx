import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as LucideIcons from 'lucide-react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ListTodo,
  Package,
} from 'lucide-react';
import {
  WidgetData,
  NeedDoPutThenConfig,
  NeedDoPutThenTile,
  DEFAULT_GLOBAL_STYLE,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { getFontClass, hexToRgba } from '@/utils/styles';
import { resolveTextPresetMultiplier } from '@/config/widgetAppearance';
import { getContrastingTextColor } from '@/components/widgets/MaterialsWidget/constants';
import {
  DEFAULT_DO_ITEMS,
  DEFAULT_NEED_ITEMS,
  DEFAULT_PUT_ITEMS,
  DEFAULT_THEN_ITEMS,
  SECTION_COLORS,
  SECTION_TITLES,
} from './constants';

const LUCIDE_ICON_MAP = LucideIcons as unknown as Record<
  string,
  React.ElementType | undefined
>;

const resolveIcon = (iconName?: string): React.ElementType =>
  (iconName ? LUCIDE_ICON_MAP[iconName] : undefined) ?? LucideIcons.Package;

const DRAWER_SIDE_SIZE = 'min(240px, 60%)';
const DRAWER_BOTTOM_SIZE = 'min(240px, 65%)';
const DRAWER_OVERLAP = 'min(28px, 7%)';
const CORNER_SAFE = 'min(24px, 5.5%)';
const MIN_DRAWER_SIZE_PX = 120;
const MAX_DRAWER_SIZE_PX = 600;

type TileOrientation = 'portrait' | 'landscape' | 'auto';

interface TileGridProps {
  items: NeedDoPutThenTile[];
  fontClass: string;
  sizeMultiplier: number;
  orientation?: TileOrientation;
}

const TileGrid: React.FC<TileGridProps> = ({
  items,
  fontClass,
  sizeMultiplier,
  orientation = 'auto',
}) => {
  const numItems = items.length;

  const cols = (() => {
    if (numItems <= 1) return 1;
    if (orientation === 'portrait') return numItems >= 7 ? 2 : 1;
    if (orientation === 'landscape') {
      if (numItems <= 2) return numItems;
      if (numItems <= 6) return Math.ceil(numItems / 2);
      return 4;
    }
    if (numItems <= 4) return 2;
    if (numItems <= 9) return 3;
    return 4;
  })();

  if (numItems === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center">
          <Package
            style={{
              width: 'min(36px, 18cqmin)',
              height: 'min(36px, 18cqmin)',
            }}
            className="opacity-30"
          />
          <span
            className="italic"
            style={{
              marginTop: 'min(8px, 2cqmin)',
              fontSize: 'min(12px, 5cqmin)',
            }}
          >
            Flip to add items
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid h-full w-full"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: 'min(8px, 3cqmin)',
      }}
    >
      {items.map((item) => {
        const Icon = resolveIcon(item.icon);
        const textColor = getContrastingTextColor(item.color);
        return (
          <div
            key={item.id}
            className={`flex flex-col items-center justify-center rounded-xl shadow-md ${fontClass}`}
            style={{
              containerType: 'size',
              background: item.color,
              color: textColor,
              padding: 'min(6px, 4cqmin)',
              gap: 'min(6px, 3cqmin)',
            }}
          >
            <Icon
              strokeWidth={2.5}
              style={{
                width: 'min(52px, 38cqmin)',
                height: 'min(52px, 38cqmin)',
              }}
            />
            <span
              className="font-black uppercase tracking-wide text-center leading-tight truncate w-full"
              style={{
                fontSize: `min(${16 * sizeMultiplier}px, ${14 * sizeMultiplier}cqmin)`,
              }}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

interface NumberedListProps {
  items: string[];
  fontClass: string;
  fontColor: string;
  sizeMultiplier: number;
}

const NumberedList: React.FC<NumberedListProps> = ({
  items,
  fontClass,
  fontColor,
  sizeMultiplier,
}) => {
  if (items.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-slate-400">
        <span className="italic" style={{ fontSize: 'min(14px, 4.5cqmin)' }}>
          Flip to add steps
        </span>
      </div>
    );
  }

  return (
    <ol
      className={`h-full w-full flex flex-col justify-around ${fontClass}`}
      style={{
        gap: 'min(14px, 4cqmin)',
        padding: 'min(6px, 2cqmin)',
      }}
    >
      {items.map((text, idx) => (
        <li
          key={idx}
          className="flex items-center"
          style={{ gap: 'min(14px, 4.5cqmin)' }}
        >
          <span
            className="rounded-full bg-slate-900 text-white font-bold flex items-center justify-center shrink-0"
            style={{
              width: `min(${36 * sizeMultiplier}px, ${14 * sizeMultiplier}cqmin)`,
              height: `min(${36 * sizeMultiplier}px, ${14 * sizeMultiplier}cqmin)`,
              fontSize: `min(${18 * sizeMultiplier}px, ${7 * sizeMultiplier}cqmin)`,
            }}
          >
            {idx + 1}
          </span>
          <span
            className="border-b border-slate-300 flex-1 break-words whitespace-normal leading-snug"
            style={{
              fontSize: `min(${22 * sizeMultiplier}px, ${9 * sizeMultiplier}cqmin)`,
              paddingBottom: 'min(4px, 1.5cqmin)',
              color: text ? fontColor : '#94a3b8',
              fontStyle: text ? 'normal' : 'italic',
            }}
          >
            {text || `Step ${idx + 1}`}
          </span>
        </li>
      ))}
    </ol>
  );
};

interface IconHeroProps {
  item: NeedDoPutThenTile;
  fontClass: string;
  fontColor: string;
  sizeMultiplier: number;
}

const IconHero: React.FC<IconHeroProps> = ({
  item,
  fontClass,
  fontColor,
  sizeMultiplier,
}) => {
  const iconTextColor = getContrastingTextColor(item.color);
  return (
    <div
      className={`h-full w-full flex flex-col items-center justify-center ${fontClass}`}
      style={{
        containerType: 'size',
        gap: 'min(14px, 5cqmin)',
        padding: 'min(8px, 3cqmin)',
      }}
    >
      <span
        className="rounded-full flex items-center justify-center"
        style={{
          width: `min(${140 * sizeMultiplier}px, ${60 * sizeMultiplier}cqmin)`,
          height: `min(${140 * sizeMultiplier}px, ${60 * sizeMultiplier}cqmin)`,
          background: item.color,
          color: iconTextColor,
        }}
      >
        {React.createElement(resolveIcon(item.icon), {
          strokeWidth: 2.5,
          style: {
            width: `min(${80 * sizeMultiplier}px, ${34 * sizeMultiplier}cqmin)`,
            height: `min(${80 * sizeMultiplier}px, ${34 * sizeMultiplier}cqmin)`,
          },
        })}
      </span>
      <span
        className="font-bold text-center leading-tight break-words w-full"
        style={{
          fontSize: `min(${28 * sizeMultiplier}px, ${13 * sizeMultiplier}cqmin)`,
          color: item.label ? fontColor : '#94a3b8',
          fontStyle: item.label ? 'normal' : 'italic',
        }}
      >
        {item.label || 'Add a label'}
      </span>
    </div>
  );
};

interface IconListProps {
  items: NeedDoPutThenTile[];
  fontClass: string;
  fontColor: string;
  sizeMultiplier: number;
}

const IconList: React.FC<IconListProps> = ({
  items,
  fontClass,
  fontColor,
  sizeMultiplier,
}) => {
  if (items.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-slate-400">
        <span className="italic" style={{ fontSize: 'min(14px, 4.5cqmin)' }}>
          Flip to add options
        </span>
      </div>
    );
  }

  if (items.length === 1) {
    return (
      <IconHero
        item={items[0]}
        fontClass={fontClass}
        fontColor={fontColor}
        sizeMultiplier={sizeMultiplier}
      />
    );
  }

  return (
    <ul
      className={`h-full w-full flex flex-col ${fontClass}`}
      style={{
        gap: 'min(8px, 2cqmin)',
        padding: 'min(6px, 2cqmin)',
      }}
    >
      {items.map((item) => {
        const Icon = resolveIcon(item.icon);
        const iconTextColor = getContrastingTextColor(item.color);
        return (
          <li
            key={item.id}
            className="flex items-center min-h-0"
            style={{
              flex: 1,
              containerType: 'size',
              gap: 'min(10px, 4cqmin)',
            }}
          >
            <span
              className="rounded-full flex items-center justify-center shrink-0"
              style={{
                width: `min(${56 * sizeMultiplier}px, ${30 * sizeMultiplier}cqmin)`,
                height: `min(${56 * sizeMultiplier}px, ${30 * sizeMultiplier}cqmin)`,
                background: item.color,
                color: iconTextColor,
              }}
            >
              <Icon
                strokeWidth={2.5}
                style={{
                  width: `min(${30 * sizeMultiplier}px, ${18 * sizeMultiplier}cqmin)`,
                  height: `min(${30 * sizeMultiplier}px, ${18 * sizeMultiplier}cqmin)`,
                }}
              />
            </span>
            <span
              className="border-b border-slate-300 flex-1 break-words whitespace-normal leading-snug"
              style={{
                fontSize: `min(${20 * sizeMultiplier}px, ${14 * sizeMultiplier}cqmin)`,
                paddingBottom: 'min(4px, 2cqmin)',
                color: item.label ? fontColor : '#94a3b8',
                fontStyle: item.label ? 'normal' : 'italic',
              }}
            >
              {item.label || 'Add a label'}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

type DrawerSide = 'left' | 'right' | 'bottom';

interface DrawerProps {
  side: DrawerSide;
  background: string;
  fontColor: string;
  fontClass: string;
  sizeMultiplier: number;
  titlePlain: string;
  titleEmphasis: string;
  accentColor: string;
  sizeOverride?: number;
  onSizeCommit: (sizePx: number) => void;
  children: React.ReactNode;
}

const Drawer: React.FC<DrawerProps> = ({
  side,
  background,
  fontColor,
  fontClass,
  sizeMultiplier,
  titlePlain,
  titleEmphasis,
  accentColor,
  sizeOverride,
  onSizeCommit,
  children,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startCoord: number; startSize: number } | null>(
    null
  );
  const [livePx, setLivePx] = useState<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = drawerRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const startSize = side === 'bottom' ? rect.height : rect.width;
    const startCoord = side === 'bottom' ? e.clientY : e.clientX;
    dragRef.current = { startCoord, startSize };
    setLivePx(startSize);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const { startCoord, startSize } = dragRef.current;
    const delta =
      side === 'left'
        ? startCoord - e.clientX
        : side === 'right'
          ? e.clientX - startCoord
          : e.clientY - startCoord;
    const next = Math.max(
      MIN_DRAWER_SIZE_PX,
      Math.min(MAX_DRAWER_SIZE_PX, startSize + delta)
    );
    setLivePx(next);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.currentTarget.releasePointerCapture(e.pointerId);
    const finalPx = livePx;
    dragRef.current = null;
    setLivePx(null);
    if (finalPx != null) {
      onSizeCommit(Math.round(finalPx));
    }
  };

  const defaultSize = side === 'bottom' ? DRAWER_BOTTOM_SIZE : DRAWER_SIDE_SIZE;
  const resolvedSize =
    livePx != null
      ? `${livePx}px`
      : sizeOverride != null
        ? `${sizeOverride}px`
        : defaultSize;

  const style: React.CSSProperties = {
    position: 'absolute',
    zIndex: -1,
    background,
    borderRadius: '1rem',
    boxShadow: '0 8px 20px -8px rgba(0,0,0,0.25)',
  };

  const basePad: React.CSSProperties = {
    padding: 'min(10px, 3cqmin)',
  };

  const overlapPlusGap = `calc(${DRAWER_OVERLAP} + 6px)`;
  const offset = `calc(${DRAWER_OVERLAP} - ${resolvedSize})`;

  if (side === 'left') {
    style.top = -1;
    style.bottom = -1;
    style.left = offset;
    style.width = resolvedSize;
    basePad.paddingTop = CORNER_SAFE;
    basePad.paddingBottom = CORNER_SAFE;
    basePad.paddingRight = overlapPlusGap;
  } else if (side === 'right') {
    style.top = -1;
    style.bottom = -1;
    style.right = offset;
    style.width = resolvedSize;
    basePad.paddingTop = CORNER_SAFE;
    basePad.paddingBottom = CORNER_SAFE;
    basePad.paddingLeft = overlapPlusGap;
  } else {
    style.left = -1;
    style.right = -1;
    style.bottom = offset;
    style.height = resolvedSize;
    basePad.paddingLeft = CORNER_SAFE;
    basePad.paddingRight = CORNER_SAFE;
    basePad.paddingTop = overlapPlusGap;
  }

  const isHorizontal = side !== 'bottom';
  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    touchAction: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: isHorizontal ? 'ew-resize' : 'ns-resize',
    ...(side === 'left' && {
      top: '50%',
      left: 0,
      transform: 'translateY(-50%)',
      width: '18px',
      height: '60px',
    }),
    ...(side === 'right' && {
      top: '50%',
      right: 0,
      transform: 'translateY(-50%)',
      width: '18px',
      height: '60px',
    }),
    ...(side === 'bottom' && {
      left: '50%',
      bottom: 0,
      transform: 'translateX(-50%)',
      width: '60px',
      height: '18px',
    }),
  };
  const pillStyle: React.CSSProperties = {
    background:
      livePx != null ? 'rgba(71,85,105,0.85)' : 'rgba(100,116,139,0.5)',
    borderRadius: '9999px',
    transition: 'background-color 120ms ease',
    ...(isHorizontal
      ? { width: '4px', height: '40px' }
      : { width: '40px', height: '4px' }),
  };

  return (
    <div
      ref={drawerRef}
      className={`${fontClass}`}
      style={{
        ...style,
        containerType: 'size',
        ...basePad,
        display: 'flex',
        flexDirection: 'column',
        gap: 'min(8px, 2.5cqmin)',
      }}
    >
      <div
        className="shrink-0 text-center truncate"
        style={{
          fontSize: `min(${22 * sizeMultiplier}px, ${12 * sizeMultiplier}cqmin)`,
          color: accentColor,
        }}
      >
        <span className="font-bold" style={{ color: fontColor, opacity: 0.75 }}>
          {titlePlain}{' '}
        </span>
        <span className="font-black">{titleEmphasis}</span>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
      <div
        aria-label={`Resize ${titleEmphasis} panel`}
        style={handleStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div style={pillStyle} />
      </div>
    </div>
  );
};

export const NeedDoPutThenWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { activeDashboard, updateWidget } = useDashboard();
  const config = widget.config as NeedDoPutThenConfig;

  const {
    needItems = DEFAULT_NEED_ITEMS,
    doItems = DEFAULT_DO_ITEMS,
    putItems = DEFAULT_PUT_ITEMS,
    thenItems = DEFAULT_THEN_ITEMS,
    cardColor = '#ffffff',
    cardOpacity = 1,
    fontColor = '#1e293b',
    drawerSize,
  } = config;

  const commitDrawerSize = useCallback(
    (key: 'need' | 'then' | 'put', sizePx: number) => {
      updateWidget(widget.id, {
        config: {
          drawerSize: {
            ...(drawerSize ?? {}),
            [key]: sizePx,
          },
        },
      });
    },
    [updateWidget, widget.id, drawerSize]
  );

  const visibleNeedItems = needItems.filter((t) => t.checked !== false);
  const visiblePutItems = putItems.filter((t) => t.checked !== false);

  const [openDrawers, setOpenDrawers] = useState<{
    need: boolean;
    put: boolean;
    then: boolean;
  }>({ need: true, put: true, then: true });

  const toggle = (key: 'need' | 'put' | 'then') =>
    setOpenDrawers((s) => ({ ...s, [key]: !s[key] }));

  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const setCentralRef = useCallback((el: HTMLDivElement | null) => {
    const target =
      (el?.closest('[data-widget-id]') as HTMLElement | null) ?? null;
    setPortalTarget((prev) => (prev === target ? prev : target));
  }, []);

  const globalFont =
    activeDashboard?.globalStyle?.fontFamily ?? DEFAULT_GLOBAL_STYLE.fontFamily;
  const fontClass = getFontClass(config.fontFamily ?? 'global', globalFont);
  const sizeMultiplier = resolveTextPresetMultiplier(config.textSizePreset);

  const nothingConfigured =
    visibleNeedItems.length === 0 &&
    visiblePutItems.length === 0 &&
    doItems.every((t) => !t) &&
    thenItems.length === 0;

  if (nothingConfigured) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={ListTodo}
            title="Need / Do / Put / Then"
            subtitle="Flip to set up each section."
          />
        }
      />
    );
  }

  const background = hexToRgba(cardColor, cardOpacity);

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          ref={setCentralRef}
          className={`h-full w-full flex flex-col rounded-2xl overflow-hidden ${fontClass}`}
          style={{
            background,
            padding: 'min(10px, 2.5cqmin)',
            gap: 'min(6px, 1.5cqmin)',
          }}
        >
          <div
            className="flex items-center justify-between shrink-0"
            style={{ gap: 'min(6px, 1.5cqmin)' }}
          >
            <button
              type="button"
              onClick={() => toggle('need')}
              className="rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              style={{ padding: 'min(4px, 1cqmin)' }}
              aria-label={
                openDrawers.need ? 'Close Need panel' : 'Open Need panel'
              }
              aria-expanded={openDrawers.need}
            >
              {openDrawers.need ? (
                <ChevronRight
                  style={{
                    width: 'min(20px, 6cqmin)',
                    height: 'min(20px, 6cqmin)',
                  }}
                />
              ) : (
                <ChevronLeft
                  style={{
                    width: 'min(20px, 6cqmin)',
                    height: 'min(20px, 6cqmin)',
                  }}
                />
              )}
            </button>

            <h3
              className="flex-1 text-center truncate"
              style={{
                fontSize: `min(${26 * sizeMultiplier}px, ${10 * sizeMultiplier}cqmin)`,
                color: SECTION_COLORS.do,
              }}
            >
              <span
                className="font-bold"
                style={{ color: fontColor, opacity: 0.75 }}
              >
                {SECTION_TITLES[1].plain}{' '}
              </span>
              <span className="font-black">{SECTION_TITLES[1].emphasis}</span>
            </h3>

            <button
              type="button"
              onClick={() => toggle('then')}
              className="rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              style={{ padding: 'min(4px, 1cqmin)' }}
              aria-label={
                openDrawers.then ? 'Close Next panel' : 'Open Next panel'
              }
              aria-expanded={openDrawers.then}
            >
              {openDrawers.then ? (
                <ChevronLeft
                  style={{
                    width: 'min(20px, 6cqmin)',
                    height: 'min(20px, 6cqmin)',
                  }}
                />
              ) : (
                <ChevronRight
                  style={{
                    width: 'min(20px, 6cqmin)',
                    height: 'min(20px, 6cqmin)',
                  }}
                />
              )}
            </button>
          </div>

          <div className="flex-1 min-h-0">
            <NumberedList
              items={doItems}
              fontClass={fontClass}
              fontColor={fontColor}
              sizeMultiplier={sizeMultiplier}
            />
          </div>

          <div className="flex items-center justify-center shrink-0">
            <button
              type="button"
              onClick={() => toggle('put')}
              className="rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              style={{ padding: 'min(4px, 1cqmin)' }}
              aria-label={
                openDrawers.put ? 'Close Put panel' : 'Open Put panel'
              }
              aria-expanded={openDrawers.put}
            >
              {openDrawers.put ? (
                <ChevronUp
                  style={{
                    width: 'min(20px, 6cqmin)',
                    height: 'min(20px, 6cqmin)',
                  }}
                />
              ) : (
                <ChevronDown
                  style={{
                    width: 'min(20px, 6cqmin)',
                    height: 'min(20px, 6cqmin)',
                  }}
                />
              )}
            </button>
          </div>

          {portalTarget &&
            createPortal(
              <>
                {openDrawers.need && (
                  <Drawer
                    side="left"
                    background={background}
                    fontColor={fontColor}
                    fontClass={fontClass}
                    sizeMultiplier={sizeMultiplier}
                    titlePlain={SECTION_TITLES[0].plain}
                    titleEmphasis={SECTION_TITLES[0].emphasis}
                    accentColor={SECTION_COLORS.need}
                    sizeOverride={drawerSize?.need}
                    onSizeCommit={(px) => commitDrawerSize('need', px)}
                  >
                    <TileGrid
                      items={visibleNeedItems}
                      fontClass={fontClass}
                      sizeMultiplier={sizeMultiplier}
                      orientation="portrait"
                    />
                  </Drawer>
                )}
                {openDrawers.then && (
                  <Drawer
                    side="right"
                    background={background}
                    fontColor={fontColor}
                    fontClass={fontClass}
                    sizeMultiplier={sizeMultiplier}
                    titlePlain={SECTION_TITLES[3].plain}
                    titleEmphasis={SECTION_TITLES[3].emphasis}
                    accentColor={SECTION_COLORS.then}
                    sizeOverride={drawerSize?.then}
                    onSizeCommit={(px) => commitDrawerSize('then', px)}
                  >
                    <IconList
                      items={thenItems}
                      fontClass={fontClass}
                      fontColor={fontColor}
                      sizeMultiplier={sizeMultiplier}
                    />
                  </Drawer>
                )}
                {openDrawers.put && (
                  <Drawer
                    side="bottom"
                    background={background}
                    fontColor={fontColor}
                    fontClass={fontClass}
                    sizeMultiplier={sizeMultiplier}
                    titlePlain={SECTION_TITLES[2].plain}
                    titleEmphasis={SECTION_TITLES[2].emphasis}
                    accentColor={SECTION_COLORS.put}
                    sizeOverride={drawerSize?.put}
                    onSizeCommit={(px) => commitDrawerSize('put', px)}
                  >
                    <TileGrid
                      items={visiblePutItems}
                      fontClass={fontClass}
                      sizeMultiplier={sizeMultiplier}
                      orientation="landscape"
                    />
                  </Drawer>
                )}
              </>,
              portalTarget
            )}
        </div>
      }
    />
  );
};

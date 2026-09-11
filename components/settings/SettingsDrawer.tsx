import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CircleHelp, Search, X } from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { WidgetBuildingToggle } from '@/components/common/WidgetBuildingToggle';
import { Z_INDEX } from '@/config/zIndex';
import { useHelpItemsForWidget } from '@/hooks/useHelpResources';
import { requestOpenHelp } from '@/components/help/helpCenterState';
import type {
  GlobalFeature,
  GlobalStyle,
  WidgetData,
  WidgetType,
} from '@/types';
import { SchemaRenderer } from './renderer/SchemaRenderer';
import { FieldRenderer } from './renderer/FieldRenderer';
import { resolveLabel } from './renderer/resolveLabel';
import type {
  FieldCtx,
  UpdateConfig,
  WidgetSettingsSchema,
} from './schema/types';
import { WindowStyleTier } from './schema/windowStyle';
import {
  buildSchemaSections,
  buildStyleSections,
  filterSections,
  hasMatches,
  normalizeQuery,
} from './settingsFilter';
import {
  clampDrawerSize,
  drawerSizeBounds,
  type DrawerPlacement,
} from './drawerConstants';

export type SettingsDrawerProps = {
  widget: WidgetData;
  /** Fallback title; `widget.customTitle` wins when set. */
  title: string;
  placement: DrawerPlacement;
  /** Drawer size in the placement's unit: px for left/right, vh for the bottom sheet. */
  width: number;
  /** Called at the END of a resize interaction only; the host persists the value. */
  onWidthCommit: (size: number) => void;
  onClose: () => void;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  updateConfig: UpdateConfig;
  globalStyle: GlobalStyle;
  /** `undefined` = still loading (skeleton); `null` = legacy widget (no schema). */
  schema?: WidgetSettingsSchema | null;
  legacySettingsContent?: React.ReactNode;
  legacyStyleContent?: React.ReactNode;
  readOnly?: boolean;
  isAdmin?: boolean;
  canAccessFeature?: (featureId: GlobalFeature) => boolean;
  canAccessWidget?: (type: WidgetType) => boolean;
  toolLabel?: (type: WidgetType) => string;
  defaults?: Record<string, unknown>;
  /** The focus hook (1b.2) targets this heading on open. */
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
};

const SETTINGS_TABS = ['settings', 'style'] as const;

const FORM_FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isFormField(target: HTMLElement | null): boolean {
  return (
    !!target &&
    (FORM_FIELD_TAGS.has(target.tagName) || target.isContentEditable)
  );
}

const SettingsDrawerComponent: React.FC<SettingsDrawerProps> = ({
  widget,
  title,
  placement,
  width,
  onWidthCommit,
  onClose,
  updateWidget,
  updateConfig,
  globalStyle,
  schema,
  legacySettingsContent,
  legacyStyleContent,
  readOnly = false,
  isAdmin = false,
  canAccessFeature,
  canAccessWidget,
  toolLabel,
  defaults,
  headingRef,
}) => {
  const { t } = useTranslation();
  const uid = useId();
  const titleId = `${uid}-title`;
  const helpItems = useHelpItemsForWidget(widget.type);
  const filterRef = useRef<HTMLInputElement>(null);
  const fallbackHeadingRef = useRef<HTMLHeadingElement>(null);
  const heading = headingRef ?? fallbackHeadingRef;

  const [activeTab, setActiveTab] = useState<'settings' | 'style'>('settings');
  const [restoreTab, setRestoreTab] = useState<'settings' | 'style'>(
    'settings'
  );
  const [query, setQuery] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  // Adjust local size while rendering when the host commits a new value or placement changes (no effect needed).
  const [size, setSize] = useState(() => clampDrawerSize(width, placement));
  const [lastWidthProp, setLastWidthProp] = useState(width);
  const [lastPlacement, setLastPlacement] = useState(placement);
  if (lastWidthProp !== width || lastPlacement !== placement) {
    setLastWidthProp(width);
    setLastPlacement(placement);
    setSize(clampDrawerSize(width, placement));
  }

  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined'
      ? 0
      : (window.visualViewport?.height ?? window.innerHeight)
  );

  useEffect(() => {
    const vv = window.visualViewport;
    const onResize = () => setViewportHeight(vv?.height ?? window.innerHeight);
    vv?.addEventListener('resize', onResize);
    window.addEventListener('resize', onResize);
    return () => {
      vv?.removeEventListener('resize', onResize);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const resolve = useCallback(
    (leaf: string) => resolveLabel(t, widget.type, leaf),
    [t, widget.type]
  );

  const config = useMemo(
    () => (widget.config ?? {}) as Record<string, unknown>,
    [widget.config]
  );

  const ctx: FieldCtx = useMemo(
    () => ({
      config,
      widget,
      isAdmin,
      canAccessFeature: canAccessFeature ?? (() => true),
      canAccessWidget,
      toolLabel,
      t,
    }),
    [config, widget, isAdmin, canAccessFeature, canAccessWidget, toolLabel, t]
  );

  const schemaSections = useMemo(
    () => buildSchemaSections(schema, ctx, resolve),
    [schema, ctx, resolve]
  );
  const styleSections = useMemo(
    () => buildStyleSections(schema, ctx, resolve),
    [schema, ctx, resolve]
  );

  const isFiltering = normalizeQuery(query) !== '';
  const filtered = useMemo(
    () => filterSections([...schemaSections, ...styleSections], query),
    [schemaSections, styleSections, query]
  );

  const setQueryAndTab = (next: string) => {
    const wasFiltering = normalizeQuery(query) !== '';
    const nowFiltering = normalizeQuery(next) !== '';
    if (!wasFiltering && nowFiltering) setRestoreTab(activeTab);
    if (wasFiltering && !nowFiltering) setActiveTab(restoreTab);
    setQuery(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    const target = e.target as HTMLElement | null;
    if (target === filterRef.current) {
      if (query !== '') setQueryAndTab('');
      else filterRef.current?.blur();
      e.stopPropagation();
      return;
    }
    if (isFormField(target)) {
      e.stopPropagation();
      return;
    }
    onClose();
    e.stopPropagation();
  };

  // Resize handle -------------------------------------------------------
  const bounds = drawerSizeBounds(placement);
  const dragRef = useRef<{ start: number; size: number } | null>(null);
  const keyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (keyCommitTimerRef.current) clearTimeout(keyCommitTimerRef.current);
    },
    []
  );

  const commit = (next: number) => {
    const clamped = clampDrawerSize(next, placement);
    setSize(clamped);
    return clamped;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      start: placement === 'bottom' ? e.clientY : e.clientX,
      size,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (placement === 'bottom') {
      const height = viewportHeight || window.innerHeight || 1;
      commit(drag.size + ((drag.start - e.clientY) / height) * 100);
      return;
    }
    const delta =
      placement === 'right' ? drag.start - e.clientX : e.clientX - drag.start;
    commit(drag.size + delta);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    onWidthCommit(size);
  };

  const handleHandleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const rtl = typeof document !== 'undefined' && document.dir === 'rtl';
    const step = e.shiftKey ? bounds.stepLarge : bounds.step;
    let delta = 0;
    if (placement === 'bottom') {
      if (e.key === 'ArrowUp') delta = step;
      else if (e.key === 'ArrowDown') delta = -step;
    } else {
      const growsOnLeft = placement === 'right' ? !rtl : rtl;
      if (e.key === 'ArrowLeft') delta = growsOnLeft ? step : -step;
      else if (e.key === 'ArrowRight') delta = growsOnLeft ? -step : step;
    }
    if (delta === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const next = commit(size + delta);
    if (keyCommitTimerRef.current) clearTimeout(keyCommitTimerRef.current);
    keyCommitTimerRef.current = setTimeout(() => {
      keyCommitTimerRef.current = null;
      onWidthCommit(next);
    }, 250);
  };

  // Layout --------------------------------------------------------------
  const isSheet = placement === 'bottom';
  const sheetHeight = Math.round(
    ((viewportHeight ||
      (typeof window === 'undefined' ? 0 : window.innerHeight)) *
      size) /
      100
  );
  const frame: React.CSSProperties = isSheet
    ? { left: 0, right: 0, bottom: 0, height: sheetHeight }
    : {
        top: 0,
        bottom: 0,
        width: size,
        ...(placement === 'right' ? { right: 0 } : { left: 0 }),
      };

  const hiddenTransform = isSheet
    ? 'translate-y-4'
    : placement === 'right'
      ? 'translate-x-4'
      : '-translate-x-4';

  const onBodyFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!isSheet) return;
    const target = e.target as HTMLElement;
    target.scrollIntoView?.({ block: 'nearest' });
  };

  const renderField = (
    field: Parameters<typeof FieldRenderer>[0]['field'],
    key: string
  ) => (
    <FieldRenderer
      key={key}
      field={field}
      widget={widget}
      ctx={ctx}
      updateConfig={updateConfig}
      defaults={defaults}
    />
  );

  const windowTier = (
    <WindowStyleTier
      widget={widget}
      updateWidget={updateWidget}
      globalStyle={globalStyle}
      t={t}
    />
  );

  const sectionHeading =
    'text-xxs font-black text-slate-700 uppercase tracking-widest mb-2';

  let body: React.ReactNode;
  if (isFiltering) {
    body = hasMatches(filtered) ? (
      <div className="flex flex-col gap-5">
        {filtered.map((section) => (
          <section key={section.id} data-filter-section={section.id}>
            <div className={sectionHeading}>{section.title}</div>
            {section.id === 'window'
              ? windowTier
              : section.fields.map((entry) =>
                  entry.field ? renderField(entry.field, entry.key) : null
                )}
          </section>
        ))}
      </div>
    ) : (
      <p className="text-sm text-slate-700">
        {t('widgetSettings.common.noMatches', { query })}
        {schema === null
          ? ` ${t('widgetSettings.common.legacyNotIndexed')}`
          : ''}
      </p>
    );
  } else if (activeTab === 'settings') {
    if (schema === undefined) {
      body = (
        <div
          className="flex flex-col gap-3"
          data-testid="settings-drawer-skeleton"
          aria-busy="true"
        >
          <span className="sr-only">{t('widgetSettings.common.loading')}</span>
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-8 rounded-lg bg-slate-100" />
          ))}
        </div>
      );
    } else if (schema === null) {
      body = legacySettingsContent ?? (
        <p className="text-sm text-slate-700">
          {t('widgetSettings.common.empty')}
        </p>
      );
    } else {
      body = (
        <SchemaRenderer
          schema={schema}
          widget={widget}
          ctx={ctx}
          updateConfig={updateConfig}
          defaults={defaults}
        />
      );
    }
  } else {
    const contentTier = styleSections.find((section) => section.id === 'style');
    body = (
      <div className="flex flex-col gap-5">
        {schema ? (
          <>
            <SchemaRenderer
              schema={schema}
              widget={widget}
              ctx={ctx}
              updateConfig={updateConfig}
              defaults={defaults}
              tab="style"
            />
            {contentTier && (
              <section data-filter-section="style">
                <div className={sectionHeading}>{contentTier.title}</div>
                {contentTier.fields.map((entry) =>
                  entry.field ? renderField(entry.field, entry.key) : null
                )}
              </section>
            )}
          </>
        ) : (
          <>{legacyStyleContent}</>
        )}
        <section data-filter-section="window">
          <div className={sectionHeading}>{resolve('style.windowTier')}</div>
          {windowTier}
        </section>
      </div>
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-widget-portal=""
      data-widget-id={widget.id}
      data-placement={placement}
      data-click-outside-ignore="true"
      onKeyDown={handleKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={`fixed flex flex-col bg-white shadow-2xl border-slate-200 transition-[opacity,transform] duration-150 motion-reduce:transition-opacity ${
        isSheet ? 'border-t rounded-t-2xl' : 'border-l'
      } ${
        isVisible
          ? 'opacity-100 translate-x-0 translate-y-0'
          : `opacity-0 ${hiddenTransform}`
      } motion-reduce:translate-x-0 motion-reduce:translate-y-0`}
      style={{ ...frame, zIndex: Z_INDEX.drawer }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          className="text-sm font-bold text-slate-800 truncate outline-none"
        >
          {widget.customTitle ?? title}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          <WidgetBuildingToggle widget={widget} updateWidget={updateWidget} />
          {helpItems.length > 0 && (
            <IconButton
              onClick={() => {
                requestOpenHelp({ tab: 'guides', widgetType: widget.type });
                onClose();
              }}
              icon={<CircleHelp className="w-4 h-4" />}
              label={t('helpCenter.widgetHelp')}
              title={t('helpCenter.widgetHelp')}
              variant="ghost"
              size="sm"
              shape="square"
            />
          )}
          <IconButton
            onClick={onClose}
            icon={<X className="w-4 h-4" />}
            label={t('widgetSettings.common.close')}
            title={t('widgetSettings.common.close')}
            variant="ghost"
            size="sm"
            shape="square"
            data-testid="settings-drawer-close"
          />
        </div>
      </div>

      <div className="px-4 pt-3 shrink-0">
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            ref={filterRef}
            type="text"
            value={query}
            onChange={(e) => setQueryAndTab(e.target.value)}
            aria-label={t('widgetSettings.common.findSetting')}
            placeholder={t('widgetSettings.common.findSetting')}
            className="w-full pl-8 pr-8 py-1.5 text-sm text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
          />
          {query !== '' && (
            <button
              type="button"
              onClick={() => setQueryAndTab('')}
              aria-label={t('widgetSettings.common.clearFilter')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <p
          role="status"
          className="mx-4 mt-3 px-3 py-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg shrink-0"
        >
          {t('widgetSettings.common.readOnly')}
        </p>
      )}

      {!isFiltering && (
        <div
          role="tablist"
          onKeyDown={(e) =>
            handleRadioGroupKeyDown(e, SETTINGS_TABS, setActiveTab)
          }
          className="flex bg-slate-100 p-1 mx-4 mt-3 rounded-xl shrink-0"
        >
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              tabIndex={activeTab === tab ? 0 : -1}
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 text-xxs font-black uppercase tracking-widest rounded-lg transition-[color,background-color,box-shadow] ${
                activeTab === tab
                  ? 'bg-white shadow-sm text-slate-800'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              {t(`widgetSettings.common.tabs.${tab}`)}
            </button>
          ))}
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        onFocus={onBodyFocus}
      >
        <fieldset disabled={readOnly} className="contents">
          {body}
        </fieldset>
      </div>

      <div
        role="separator"
        aria-orientation={isSheet ? 'horizontal' : 'vertical'}
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={size}
        aria-label={t('widgetSettings.common.resizeDrawer')}
        tabIndex={0}
        onKeyDown={handleHandleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        data-testid="settings-drawer-resize"
        className={`absolute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
          isSheet
            ? 'top-0 left-0 right-0 h-2 cursor-row-resize'
            : `top-0 bottom-0 w-2 cursor-col-resize ${
                placement === 'right' ? 'left-0' : 'right-0'
              }`
        }`}
      />
    </div>,
    document.body
  );
};

export const SettingsDrawer = React.memo(SettingsDrawerComponent);
SettingsDrawer.displayName = 'SettingsDrawer';

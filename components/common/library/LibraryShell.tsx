import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Activity,
  Archive as ArchiveIcon,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import type {
  LibraryShellProps,
  LibraryTab,
  LibraryPrimaryAction,
  LibraryFolderPanelSetting,
} from './types';
import {
  LibraryFolderPanelContext,
  type FolderPanelMode,
} from './LibraryFolderPanelContext';

/**
 * Widget-width breakpoints (px) for auto-collapsing the folder panel. Below
 * `HIDE_BELOW_PX` the panel is not rendered (caller surfaces a picker
 * elsewhere); below `RAIL_BELOW_PX` the panel shrinks to an icon rail.
 */
const HIDE_BELOW_PX = 360;
const RAIL_BELOW_PX = 560;

const resolveFolderPanelMode = (
  setting: LibraryFolderPanelSetting,
  widthPx: number | null
): FolderPanelMode => {
  if (setting === 'full' || setting === 'rail' || setting === 'hidden') {
    return setting;
  }
  if (widthPx == null) return 'full';
  if (widthPx < HIDE_BELOW_PX) return 'hidden';
  if (widthPx < RAIL_BELOW_PX) return 'rail';
  return 'full';
};

const cycleFolderPanelSetting = (
  current: FolderPanelMode
): LibraryFolderPanelSetting => {
  // Toggle progression: full ↔ rail ↔ hidden. Always lands on an explicit
  // setting so the user's choice sticks (instead of reverting to 'auto').
  if (current === 'full') return 'rail';
  if (current === 'rail') return 'hidden';
  return 'full';
};

interface TabDef {
  key: LibraryTab;
  label: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>;
  count: number | undefined;
}

const renderActionButton = (
  action: LibraryPrimaryAction,
  variant: 'primary' | 'secondary',
  labelsHidden: boolean,
  key?: string
): React.ReactElement => {
  const Icon = action.icon;
  const base =
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClass =
    variant === 'primary'
      ? 'bg-brand-blue-primary hover:bg-brand-blue-dark text-white'
      : 'bg-white/70 backdrop-blur-sm hover:bg-brand-blue-lighter/40 text-brand-blue-primary border border-brand-blue-primary/20';
  return (
    <button
      key={key}
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      title={
        action.disabled
          ? action.disabledReason
          : labelsHidden
            ? action.label
            : undefined
      }
      aria-label={action.label}
      className={`${base} ${variantClass}`}
      style={{
        paddingInline: labelsHidden ? '0' : 'min(14px, 3cqmin)',
        paddingBlock: 'min(8px, 1.8cqmin)',
        fontSize: 'min(14px, 4cqmin)',
        minWidth: labelsHidden ? 'min(36px, 10cqmin)' : undefined,
        height: labelsHidden ? 'min(36px, 10cqmin)' : undefined,
      }}
    >
      {Icon && (
        <Icon
          style={{
            width: 'min(16px, 4.5cqmin)',
            height: 'min(16px, 4.5cqmin)',
          }}
          className="shrink-0"
        />
      )}
      {!labelsHidden && <span className="truncate">{action.label}</span>}
    </button>
  );
};

export const LibraryShell: React.FC<LibraryShellProps> = ({
  widgetLabel,
  tab,
  onTabChange,
  counts,
  primaryAction,
  secondaryActions,
  toolbarSlot,
  filterSidebarSlot,
  folderPanelMode: folderPanelModeProp,
  onFolderPanelModeChange,
  children,
}) => {
  // When the caller doesn't wire a controlled setting, fall back to internal
  // state so the chevron toggle still works (just won't persist across mounts).
  const [uncontrolledMode, setUncontrolledMode] =
    useState<LibraryFolderPanelSetting>('auto');
  const folderPanelSetting = folderPanelModeProp ?? uncontrolledMode;
  const setFolderPanelSetting = (next: LibraryFolderPanelSetting): void => {
    if (onFolderPanelModeChange) onFolderPanelModeChange(next);
    else setUncontrolledMode(next);
  };
  const tabs: TabDef[] = [
    {
      key: 'library',
      label: 'Library',
      icon: BookOpen,
      count: counts?.library,
    },
    {
      key: 'active',
      label: 'In Progress',
      icon: Activity,
      count: counts?.active,
    },
    {
      key: 'archive',
      label: 'Archive',
      icon: ArchiveIcon,
      count: counts?.archive,
    },
  ];

  // Collapse header action labels to icon-only when the widget is narrow so
  // buttons never push off-screen. A crude width threshold based on the number
  // of buttons keeps parity with the inline/overflow logic on library cards.
  const rootRef = useRef<HTMLElement>(null);
  const [rootWidth, setRootWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setRootWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const buttonCount = (primaryAction ? 1 : 0) + (secondaryActions?.length ?? 0);
  const labelsHidden = rootWidth != null && rootWidth < 260 + buttonCount * 110;

  const effectiveFolderPanelMode: FolderPanelMode = useMemo(
    () => resolveFolderPanelMode(folderPanelSetting, rootWidth),
    [folderPanelSetting, rootWidth]
  );
  const folderPanelContextValue = useMemo(
    () => ({ mode: effectiveFolderPanelMode }),
    [effectiveFolderPanelMode]
  );
  const shouldRenderFolderPanel =
    filterSidebarSlot != null && effectiveFolderPanelMode !== 'hidden';

  return (
    <section
      ref={rootRef}
      className="flex flex-col h-full min-h-0 text-slate-800 rounded-2xl overflow-hidden"
      aria-label={`${widgetLabel} library`}
    >
      <header
        className="flex items-center justify-between gap-3 bg-white/60 backdrop-blur-sm border-b border-slate-200/70 shrink-0"
        style={{
          paddingInline: 'min(24px, 5cqmin)',
          paddingBlock: 'min(16px, 3.5cqmin)',
        }}
      >
        <div className="min-w-0">
          <h2
            className="font-black text-slate-800 truncate"
            style={{ fontSize: 'min(18px, 5.5cqmin)' }}
          >
            {widgetLabel} Library
          </h2>
        </div>
        {(primaryAction != null ||
          (secondaryActions != null && secondaryActions.length > 0)) && (
          <div
            className="flex items-center shrink-0"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            {secondaryActions?.map((action, i) =>
              renderActionButton(
                action,
                'secondary',
                labelsHidden,
                `secondary-${i}`
              )
            )}
            {primaryAction &&
              renderActionButton(primaryAction, 'primary', labelsHidden)}
          </div>
        )}
      </header>

      <nav
        role="tablist"
        aria-label={`${widgetLabel} library tabs`}
        className="flex items-end bg-white/60 backdrop-blur-sm border-b border-slate-200/70 shrink-0"
        style={{
          gap: 'min(4px, 1cqmin)',
          paddingInline: 'min(24px, 5cqmin)',
          paddingTop: 'min(12px, 2.5cqmin)',
        }}
      >
        {tabs.map(({ key, label, icon: Icon, count }) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onTabChange(key)}
              className={`inline-flex items-center rounded-t-xl font-black uppercase tracking-widest transition-colors ${
                selected
                  ? 'bg-white/40 text-brand-blue-primary border-x border-t border-slate-200/70'
                  : 'text-slate-500 hover:text-brand-blue-primary hover:bg-white/30'
              }`}
              style={{
                gap: 'min(8px, 2cqmin)',
                paddingInline: 'min(16px, 3.5cqmin)',
                paddingBlock: 'min(10px, 2.2cqmin)',
                fontSize: 'min(13px, 3.8cqmin)',
              }}
            >
              <Icon
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
                className="shrink-0"
              />
              <span>{label}</span>
              {count != null && count > 0 && (
                <span
                  className={`inline-flex items-center justify-center rounded-full font-bold leading-none ${
                    selected
                      ? 'bg-brand-blue-primary text-white'
                      : 'bg-slate-200/70 text-slate-600'
                  }`}
                  style={{
                    paddingInline: 'min(8px, 2cqmin)',
                    paddingBlock: 'min(2px, 0.5cqmin)',
                    fontSize: 'min(10px, 3cqmin)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {toolbarSlot && (
        <div
          className="bg-white/40 backdrop-blur-sm border-b border-slate-200/70 shrink-0"
          style={{
            paddingInline: 'min(24px, 5cqmin)',
            paddingBlock: 'min(12px, 2.5cqmin)',
          }}
        >
          {toolbarSlot}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {shouldRenderFolderPanel && (
          <LibraryFolderPanelContext.Provider value={folderPanelContextValue}>
            <aside
              className="shrink-0 bg-white/40 backdrop-blur-sm border-r border-slate-200/70 overflow-y-auto flex flex-col"
              style={{
                width:
                  effectiveFolderPanelMode === 'rail'
                    ? 'min(56px, 14cqmin)'
                    : 'min(240px, 30cqmin)',
              }}
              aria-label="Folders"
            >
              <div
                className="flex items-center justify-end shrink-0"
                style={{
                  paddingInline:
                    effectiveFolderPanelMode === 'rail'
                      ? 'min(4px, 1cqmin)'
                      : 'min(8px, 2cqmin)',
                  paddingBlock: 'min(6px, 1.5cqmin)',
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setFolderPanelSetting(
                      cycleFolderPanelSetting(effectiveFolderPanelMode)
                    )
                  }
                  className="inline-flex items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/70 hover:text-brand-blue-primary"
                  style={{
                    width: 'min(28px, 7cqmin)',
                    height: 'min(28px, 7cqmin)',
                  }}
                  title={
                    effectiveFolderPanelMode === 'full'
                      ? 'Collapse folders'
                      : effectiveFolderPanelMode === 'rail'
                        ? 'Hide folders'
                        : 'Show folders'
                  }
                  aria-label="Toggle folder panel"
                >
                  {effectiveFolderPanelMode === 'full' ? (
                    <ChevronsLeft
                      style={{
                        width: 'min(16px, 4.5cqmin)',
                        height: 'min(16px, 4.5cqmin)',
                      }}
                    />
                  ) : (
                    <ChevronsRight
                      style={{
                        width: 'min(16px, 4.5cqmin)',
                        height: 'min(16px, 4.5cqmin)',
                      }}
                    />
                  )}
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {filterSidebarSlot}
              </div>
            </aside>
          </LibraryFolderPanelContext.Provider>
        )}
        {!shouldRenderFolderPanel && filterSidebarSlot != null && (
          <div
            className="shrink-0 border-r border-slate-200/70 bg-white/40 backdrop-blur-sm flex items-start justify-center"
            style={{
              paddingInline: 'min(6px, 1.5cqmin)',
              paddingBlock: 'min(8px, 2cqmin)',
            }}
          >
            <button
              type="button"
              onClick={() => setFolderPanelSetting('rail')}
              className="inline-flex items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/70 hover:text-brand-blue-primary"
              style={{
                width: 'min(28px, 7cqmin)',
                height: 'min(28px, 7cqmin)',
              }}
              title="Show folders"
              aria-label="Show folders"
            >
              <ChevronsRight
                style={{
                  width: 'min(16px, 4.5cqmin)',
                  height: 'min(16px, 4.5cqmin)',
                }}
              />
            </button>
          </div>
        )}
        <div
          role="tabpanel"
          aria-label={`${widgetLabel} ${tab} tab content`}
          className="flex-1 min-w-0 overflow-y-auto"
          style={{
            paddingInline: 'min(24px, 5cqmin)',
            paddingBlock: 'min(20px, 4.5cqmin)',
          }}
        >
          {children}
        </div>
      </div>
    </section>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Activity,
  Archive as ArchiveIcon,
  Library,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { OverflowMenu } from '@/components/common/sessionViews/OverflowMenu';
import { tourAttr, tourTypeAttr, tourFieldAttr } from '@/config/tourAnchors';
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
import { LibraryPreviewSlotContext } from './LibraryPreviewSlotContext';
import { LibraryRowWidthContext } from './LibraryRowWidthContext';
import { SegmentedTabs } from '@/components/common/sessionViews/SegmentedTabs';
import { TOOLS } from '@/config/tools';
import { LIBRARY_HEADER_ACCENTS } from './libraryAccents';
import { LibraryFolderViewContext } from './LibraryFolderViewContext';
import { FolderViewHeader } from './FolderViewHeader';
import {
  autoFolderPanelMode,
  isShortLibrary,
  resolveFolderPanelMode,
  resolveHeaderLabels,
} from './libraryShellLayout';

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
  key?: string,
  extraClass = '',
  accented = false,
  tourProps: Record<string, string> = {}
): React.ReactElement => {
  const Icon = action.icon;
  const base =
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
  // Buttons sit on the solid blue header bar: primary inverts to a white
  // chip; secondary is a translucent white ghost.
  const variantClass =
    variant === 'primary'
      ? accented
        ? 'bg-white hover:bg-slate-100 text-[color:var(--library-accent)]'
        : 'bg-white hover:bg-brand-blue-lighter text-brand-blue-primary'
      : 'bg-white/15 hover:bg-white/25 text-white border border-white/30';
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
      {...tourProps}
      className={`${base} ${variantClass} ${extraClass}`}
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
  tabLabels,
  visibleTabs,
  primaryAction,
  secondaryActions,
  toolbarSlot,
  filterSidebarSlot,
  folderPanelMode: folderPanelModeProp,
  onFolderPanelModeChange,
  children,
  widgetType,
  folderView,
  folderViewMode = 'list',
}) => {
  const activeFolderView =
    tab === 'library' || tab === 'banks' ? (folderView ?? null) : null;
  // When the caller doesn't wire a controlled setting, fall back to internal
  // state so the chevron toggle still works (just won't persist across mounts).
  const [uncontrolledMode, setUncontrolledMode] =
    useState<LibraryFolderPanelSetting>('auto');
  const folderPanelSetting = folderPanelModeProp ?? uncontrolledMode;
  const setFolderPanelSetting = (next: LibraryFolderPanelSetting): void => {
    if (onFolderPanelModeChange) onFolderPanelModeChange(next);
    else setUncontrolledMode(next);
  };
  const widgetTool = widgetType
    ? TOOLS.find((tool) => tool.type === widgetType)
    : undefined;
  const accent = widgetType ? LIBRARY_HEADER_ACCENTS[widgetType] : undefined;
  const allTabs: TabDef[] = [
    {
      key: 'library',
      label: tabLabels?.library ?? 'Library',
      icon: widgetTool?.icon ?? BookOpen,
      count: counts?.library,
    },
    // Banks is Quiz-only: managers that never pass `counts.banks` are unchanged.
    ...(counts?.banks !== undefined
      ? [
          {
            key: 'banks' as const,
            label: tabLabels?.banks ?? 'Banks',
            icon: Library,
            count: counts.banks,
          },
        ]
      : []),
    {
      key: 'active',
      label: tabLabels?.active ?? 'In Progress',
      icon: Activity,
      count: counts?.active,
    },
    {
      key: 'archive',
      label: tabLabels?.archive ?? 'Archive',
      icon: ArchiveIcon,
      count: counts?.archive,
    },
  ];
  // Embedded callers (e.g. PLC dashboard tile) pass `visibleTabs` to drop
  // chrome they don't need. Empty array would be a footgun (renders no
  // nav at all), so we treat undefined/null as "show all" but respect
  // an explicit empty array if a caller really wants to suppress the
  // tab bar.
  const tabs =
    visibleTabs == null
      ? allTabs
      : allTabs.filter((tabDef) => visibleTabs.includes(tabDef.key));

  // If the active tab is filtered out by `visibleTabs`, redirect to the
  // first visible tab so the chrome doesn't render an empty nav with a
  // mismatched tabpanel below. Adjust state during render — same pattern
  // we use across the codebase for derived-from-props state.
  const firstVisibleTab = tabs[0]?.key;
  if (
    firstVisibleTab &&
    visibleTabs != null &&
    !tabs.some((t) => t.key === tab)
  ) {
    onTabChange(firstVisibleTab);
  }

  // Collapse header action labels to icon-only when the widget is narrow so
  // buttons never push off-screen. A crude width threshold based on the number
  // of buttons keeps parity with the inline/overflow logic on library cards.
  const rootRef = useRef<HTMLElement>(null);
  const [previewSlot, setPreviewSlot] = useState<HTMLDivElement | null>(null);
  const [rootWidth, setRootWidth] = useState<number | null>(null);
  const [rootHeight, setRootHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setRootWidth(entry.contentRect.width);
      setRootHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  useEffect(() => {
    if (!scrollEl || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setRowWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);
  const actionLabels = [
    ...(secondaryActions ?? []).map((action) => action.label),
    ...(primaryAction ? [primaryAction.label] : []),
  ];
  const { actionLabelsHidden: labelsHidden, tabLabelsHidden } =
    resolveHeaderLabels(rootWidth, tabs, actionLabels);

  // The auto band a toggled setting was chosen in; 'expired' once the widget leaves it.
  const autoMode = autoFolderPanelMode(rootWidth);
  const [choiceBand, setChoiceBand] = useState<
    FolderPanelMode | 'expired' | null
  >(null);
  if (rootWidth != null && choiceBand === null) {
    setChoiceBand(autoMode);
  } else if (
    choiceBand !== null &&
    choiceBand !== 'expired' &&
    choiceBand !== autoMode
  ) {
    setChoiceBand('expired');
  }
  const effectiveFolderPanelMode = resolveFolderPanelMode(
    folderPanelSetting,
    rootWidth,
    choiceBand === null || choiceBand === autoMode
  );
  const chooseFolderPanelSetting = (next: LibraryFolderPanelSetting): void => {
    setFolderPanelSetting(next);
    setChoiceBand(autoMode);
  };
  const folderPanelContextValue = useMemo(
    () => ({ mode: effectiveFolderPanelMode }),
    [effectiveFolderPanelMode]
  );
  const shouldRenderFolderPanel =
    filterSidebarSlot != null && effectiveFolderPanelMode !== 'hidden';

  const showFoldersButton =
    !shouldRenderFolderPanel && filterSidebarSlot != null ? (
      <button
        type="button"
        onClick={() => chooseFolderPanelSetting('full')}
        className="inline-flex items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-brand-blue-lighter/40 hover:text-brand-blue-primary"
        style={{
          width: 'min(28px, 7cqmin)',
          height: 'min(28px, 7cqmin)',
        }}
        title="Show folders"
        aria-label="Show folders"
        {...tourTypeAttr('library-shell.show-folders', widgetType ?? 'library')}
      >
        <ChevronsRight
          style={{
            width: 'min(16px, 4.5cqmin)',
            height: 'min(16px, 4.5cqmin)',
          }}
        />
      </button>
    ) : null;

  const foldersButtonInToolbar =
    Boolean(toolbarSlot) && isShortLibrary(rootHeight);

  return (
    <section
      ref={rootRef}
      className="flex flex-col h-full min-h-0 text-brand-gray-dark bg-white rounded-[var(--window-radius,0px)] overflow-hidden"
      aria-label={`${widgetLabel} library`}
    >
      {/* Single chrome bar: segmented tab control on the left, header
          actions on the right. Replaces the old stacked header ("X Library"
          title — redundant inside the widget) + folder-tab nav, recovering
          a full bar of vertical space for content. */}
      {(tabs.length > 0 ||
        primaryAction != null ||
        (secondaryActions != null && secondaryActions.length > 0)) && (
        <div
          className={`flex items-center justify-between shrink-0 ${accent ? '' : 'bg-brand-blue-primary'}`}
          style={{
            ...(accent
              ? ({
                  backgroundColor: accent,
                  '--library-accent': accent,
                } as React.CSSProperties)
              : {}),
            gap: 'min(12px, 2.5cqmin)',
            paddingInline: 'min(16px, 3.5cqmin)',
            paddingBlock: 'min(8px, 1.8cqmin)',
          }}
        >
          {tabs.length > 0 ? (
            <SegmentedTabs
              tabs={tabs}
              value={tab}
              onChange={onTabChange}
              labelsHidden={tabLabelsHidden}
              ariaLabel={`${widgetLabel} library tabs`}
              onDark
              accentColor={accent}
              tourId="library-shell.tab"
              tourScope={widgetType ?? 'library'}
            />
          ) : (
            <div className="min-w-0" />
          )}
          {(primaryAction != null ||
            (secondaryActions != null && secondaryActions.length > 0)) && (
            <div
              className="flex items-center shrink-0"
              style={{ gap: 'min(8px, 2cqmin)' }}
            >
              {secondaryActions?.map((action, i) => {
                const anchor = tourFieldAttr(
                  'library-shell.secondary-action',
                  widgetType ?? 'library',
                  `row-${i + 1}`
                );
                return action.menuItems?.length ? (
                  <OverflowMenu
                    key={`secondary-${i}`}
                    items={action.menuItems}
                    ariaLabel={action.label}
                    triggerTitle={labelsHidden ? action.label : undefined}
                    triggerProps={anchor}
                    tourId="library-shell.secondary-menu-item"
                    tourScope={widgetType ?? 'library'}
                    triggerClassName="gap-1.5 rounded-xl font-bold shadow-sm active:scale-95 bg-white/15 hover:bg-white/25 text-white border border-white/30"
                    triggerStyle={{
                      paddingInline: labelsHidden ? '0' : 'min(14px, 3cqmin)',
                      paddingBlock: 'min(8px, 1.8cqmin)',
                      fontSize: 'min(14px, 4cqmin)',
                      minWidth: labelsHidden ? 'min(36px, 10cqmin)' : undefined,
                      height: labelsHidden ? 'min(36px, 10cqmin)' : undefined,
                    }}
                    triggerContent={
                      <>
                        {action.icon && (
                          <action.icon
                            style={{
                              width: 'min(16px, 4.5cqmin)',
                              height: 'min(16px, 4.5cqmin)',
                            }}
                            className="shrink-0"
                          />
                        )}
                        {!labelsHidden && (
                          <span className="truncate">{action.label}</span>
                        )}
                      </>
                    }
                  />
                ) : (
                  renderActionButton(
                    action,
                    'secondary',
                    labelsHidden,
                    `secondary-${i}`,
                    '',
                    false,
                    anchor
                  )
                );
              })}
              {primaryAction &&
                (primaryAction.menuItems?.length ? (
                  <OverflowMenu
                    items={primaryAction.menuItems}
                    ariaLabel={primaryAction.label}
                    triggerTitle={
                      labelsHidden ? primaryAction.label : undefined
                    }
                    triggerProps={
                      widgetType
                        ? tourTypeAttr('library-shell.new', widgetType)
                        : tourAttr('library-shell.new')
                    }
                    tourId="library-shell.new-menu-item"
                    tourScope={widgetType ?? 'library'}
                    triggerClassName={`gap-1.5 rounded-xl font-bold shadow-sm active:scale-95 ${
                      accent
                        ? 'bg-white hover:bg-slate-100 text-[color:var(--library-accent)]'
                        : 'bg-white hover:bg-brand-blue-lighter text-brand-blue-primary'
                    }`}
                    triggerStyle={{
                      paddingInline: labelsHidden ? '0' : 'min(14px, 3cqmin)',
                      paddingBlock: 'min(8px, 1.8cqmin)',
                      fontSize: 'min(14px, 4cqmin)',
                      minWidth: labelsHidden ? 'min(36px, 10cqmin)' : undefined,
                      height: labelsHidden ? 'min(36px, 10cqmin)' : undefined,
                    }}
                    triggerContent={
                      <>
                        {primaryAction.icon && (
                          <primaryAction.icon
                            style={{
                              width: 'min(16px, 4.5cqmin)',
                              height: 'min(16px, 4.5cqmin)',
                            }}
                            className="shrink-0"
                          />
                        )}
                        {!labelsHidden && (
                          <span className="truncate">
                            {primaryAction.label}
                          </span>
                        )}
                      </>
                    }
                  />
                ) : (
                  renderActionButton(
                    primaryAction,
                    'primary',
                    labelsHidden,
                    undefined,
                    '',
                    accent != null,
                    widgetType
                      ? tourTypeAttr('library-shell.new', widgetType)
                      : tourAttr('library-shell.new')
                  )
                ))}
            </div>
          )}
        </div>
      )}

      {toolbarSlot && (
        <div
          className="bg-white border-b border-brand-gray-lightest shrink-0"
          style={{
            paddingInline: 'min(16px, 3.5cqmin)',
            paddingBlock: 'min(10px, 2.2cqmin)',
          }}
        >
          {showFoldersButton != null && foldersButtonInToolbar ? (
            <div
              className="flex items-start"
              style={{ gap: 'min(8px, 2cqmin)' }}
            >
              <div
                className="shrink-0 flex"
                style={{ marginTop: 'min(4px, 1px + 2cqmin)' }}
              >
                {showFoldersButton}
              </div>
              <div className="flex-1 min-w-0">{toolbarSlot}</div>
            </div>
          ) : (
            toolbarSlot
          )}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {shouldRenderFolderPanel && (
          <LibraryFolderPanelContext.Provider value={folderPanelContextValue}>
            <aside
              className="shrink-0 bg-white border-r border-brand-gray-lightest overflow-y-auto flex flex-col"
              style={{
                // Width-based (cqw) sizing, not cqmin: the panel competes for
                // horizontal space, so the widget's height shouldn't shrink
                // it. With cqmin, a wide-but-short widget got a needlessly
                // narrow panel and folder names truncated next to empty space.
                width:
                  effectiveFolderPanelMode === 'rail'
                    ? 'clamp(44px, 10cqw, 56px)'
                    : 'clamp(160px, 26cqw, 240px)',
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
                    chooseFolderPanelSetting(
                      cycleFolderPanelSetting(effectiveFolderPanelMode)
                    )
                  }
                  className="inline-flex items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-brand-blue-lighter/40 hover:text-brand-blue-primary"
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
                  {...tourTypeAttr(
                    'library-shell.folder-panel-toggle',
                    widgetType ?? 'library'
                  )}
                >
                  <ChevronsLeft
                    style={{
                      width: 'min(16px, 4.5cqmin)',
                      height: 'min(16px, 4.5cqmin)',
                    }}
                  />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {filterSidebarSlot}
              </div>
            </aside>
          </LibraryFolderPanelContext.Provider>
        )}
        {showFoldersButton != null && !foldersButtonInToolbar && (
          <div
            className="shrink-0 border-r border-brand-gray-lightest bg-white flex items-start justify-center"
            style={{
              paddingInline: 'min(6px, 1.5cqmin)',
              paddingBlock: 'min(8px, 2cqmin)',
            }}
          >
            {showFoldersButton}
          </div>
        )}
        <div
          role="tabpanel"
          aria-label={`${widgetLabel} ${tab} tab content`}
          className="flex flex-1 min-w-0 min-h-0"
        >
          <div
            ref={setScrollEl}
            className="flex-1 min-w-0 overflow-y-auto"
            style={{
              paddingInline: 'min(16px, 3.5cqmin)',
              paddingBlock: 'min(14px, 3cqmin)',
            }}
            data-testid="library-scroll"
          >
            <LibraryPreviewSlotContext.Provider value={previewSlot}>
              <LibraryRowWidthContext.Provider value={rowWidth}>
                <LibraryFolderViewContext.Provider value={activeFolderView}>
                  {activeFolderView && (
                    <FolderViewHeader
                      model={activeFolderView}
                      viewMode={folderViewMode}
                      includeRows={false}
                    />
                  )}
                  {children}
                </LibraryFolderViewContext.Provider>
              </LibraryRowWidthContext.Provider>
            </LibraryPreviewSlotContext.Provider>
          </div>
          {/* Preview panes portal here so they sit outside the scroller at full height. */}
          <div ref={setPreviewSlot} className="contents" />
        </div>
      </div>
    </section>
  );
};

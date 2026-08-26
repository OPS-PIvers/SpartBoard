import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Fuse from 'fuse.js';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderPlus,
  LayoutGrid,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Puzzle,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { getCustomWidgetIcon } from '@/config/customWidgetIcons';
import {
  CustomWidgetDoc,
  SavedWidget,
  GradeLevel,
  WidgetCategory,
} from '@/types';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GlassCard } from '@/components/common/GlassCard';
import { IconButton } from '@/components/common/IconButton';
import { TOOLS, WIDGET_CATEGORIES } from '@/config/tools';
import { WidgetType, GlobalStyle, InternalToolType } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useDialog } from '@/context/useDialog';
import { useLongPress } from '@/hooks/useLongPress';
import { useToolVisibility } from '@/context/useToolVisibility';
import { beginWidgetDrag, endWidgetDrag } from '@/utils/widgetDragFlag';

// O(1) Lookup Map for TOOLS optimization.
// Extracted outside the component to prevent recreating the map on every mount.
const TOOLS_MAP = new Map<WidgetType | InternalToolType, (typeof TOOLS)[0]>(
  TOOLS.map((t) => [t.type, t])
);

const noop = () => {
  // long-press placeholder when no edit-mode entry callback is provided
};

const GRADE_OPTIONS: { value: GradeLevel | 'all'; label: string }[] = [
  { value: 'all', label: 'All Grades' },
  { value: 'k-2', label: 'K-2' },
  { value: '3-5', label: '3-5' },
  { value: '6-8', label: '6-8' },
  { value: '9-12', label: '9-12' },
];

interface WidgetLibraryProps {
  onToggle: (type: WidgetType | InternalToolType) => void;
  visibleTools: (WidgetType | InternalToolType)[];
  canAccess: (type: WidgetType | InternalToolType) => boolean;
  /** In normal (non-edit) mode, only widgets returning true are shown */
  matchesUserBuilding?: (type: WidgetType | InternalToolType) => boolean;
  /** Permission-aware grade levels per tool, for the grade filter */
  getToolGradeLevels?: (type: WidgetType | InternalToolType) => GradeLevel[];
  onClose: () => void;
  globalStyle: GlobalStyle;
  triggerRef?: React.RefObject<HTMLElement | null>;
  libraryOrder: (WidgetType | InternalToolType)[];
  onReorderLibrary: (tools: (WidgetType | InternalToolType)[]) => void;
  isEditMode?: boolean;
  /** Enters dock edit mode (Edit button + long-press on library cards) */
  onEnterEditMode?: () => void;
  onAddFolder?: () => void;
  getToolLabel?: (type: WidgetType | InternalToolType) => string;
  /** Published custom widgets to show as an additional section */
  customWidgets?: CustomWidgetDoc[];
  /** Called when a custom widget card is clicked */
  onAddCustomWidget?: (customWidgetId: string) => void;
  /** User's saved-widget shortcuts (e.g. saved Mini Apps) */
  savedWidgets?: SavedWidget[];
  /** Called when a saved widget card is clicked — adds an instance to the board */
  onAddSavedWidget?: (savedWidgetId: string) => void;
  /** Called to toggle whether a saved widget is pinned to the dock */
  onToggleSavedWidgetPin?: (savedWidgetId: string, pinned: boolean) => void;
  /** Called when the trash icon is clicked on a saved widget card */
  onDeleteSavedWidget?: (savedWidgetId: string) => void;
}

const SortableLibraryTool = React.memo(
  ({
    tool,
    isActive,
    isEditMode,
    isHidden = false,
    sortDisabled,
    onToggle,
    onToggleHidden,
    onLongPress,
    label,
  }: {
    tool: (typeof TOOLS)[0];
    isActive: boolean;
    isEditMode: boolean;
    isHidden?: boolean;
    /** Disables drag reorder (while searching/filtering, or in the hidden section) */
    sortDisabled?: boolean;
    onToggle: (type: WidgetType | InternalToolType) => void;
    onToggleHidden?: (type: WidgetType | InternalToolType) => void;
    onLongPress?: () => void;
    label?: string;
  }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: tool.type, disabled: sortDisabled });

    const longPressHandlers = useLongPress(onLongPress ?? noop, {
      disabled: isEditMode || !onLongPress,
      onPointerDown: listeners?.onPointerDown,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? Z_INDEX.itemDragging : 1,
    };

    return (
      <div ref={setNodeRef} style={style} className="relative">
        <button
          {...attributes}
          {...longPressHandlers}
          onClick={(e) => {
            // Prevent click if dragging happened
            if (e.defaultPrevented) return;
            onToggle(tool.type);
          }}
          className={`w-full flex flex-col items-center gap-2 p-4 rounded-2xl transition-all group active:scale-95 border-2 ${
            isActive
              ? 'bg-white/80 border-brand-blue-primary shadow-md'
              : 'bg-white/20 border-transparent hover:bg-white/30'
          } ${isHidden ? 'opacity-60' : 'opacity-100'} ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          } ${isEditMode && !isHidden ? 'animate-jiggle' : ''}`}
        >
          <div
            className={`${tool.color} p-3 rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform relative`}
          >
            <tool.icon className="w-6 h-6" />
            {isEditMode && !isHidden && (
              <div className="absolute -top-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow-sm ring-2 ring-white">
                <Plus className="w-2.5 h-2.5" />
              </div>
            )}
            {!isEditMode && isActive && (
              <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full p-0.5 shadow-sm">
                <Plus className="w-2.5 h-2.5 rotate-45" />
              </div>
            )}
          </div>
          <span className="text-xxs font-black uppercase text-slate-700 tracking-tight text-center leading-tight">
            {label ?? tool.label}
          </span>
        </button>
        {/* Hide (edit mode) / unhide (any mode) toggle */}
        {onToggleHidden && (isHidden || isEditMode) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleHidden(tool.type);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`absolute top-1 left-1 p-1 rounded-md shadow-sm transition-all ${
              isHidden
                ? 'bg-white text-brand-blue-primary hover:bg-brand-blue-primary hover:text-white'
                : 'bg-white/90 text-slate-400 hover:text-slate-700 hover:bg-white'
            }`}
            aria-label={isHidden ? 'Unhide widget' : 'Hide widget'}
            title={isHidden ? 'Unhide widget' : 'Hide from library'}
          >
            {isHidden ? (
              <Eye className="w-3.5 h-3.5" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
    );
  }
);

SortableLibraryTool.displayName = 'SortableLibraryTool';

export const WidgetLibrary = forwardRef<HTMLDivElement, WidgetLibraryProps>(
  (
    {
      onToggle,
      visibleTools,
      canAccess,
      matchesUserBuilding,
      getToolGradeLevels,
      onClose,
      globalStyle,
      triggerRef,
      libraryOrder,
      onReorderLibrary,
      isEditMode = false,
      onEnterEditMode,
      onAddFolder,
      getToolLabel,
      customWidgets = [],
      onAddCustomWidget,
      savedWidgets = [],
      onAddSavedWidget,
      onToggleSavedWidgetPin,
      onDeleteSavedWidget,
    },
    ref
  ) => {
    const { showConfirm } = useDialog();
    const { resetDockToDefaults, hiddenTools, toggleToolHidden } =
      useToolVisibility();

    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<
      WidgetCategory | 'all'
    >('all');
    const [gradeFilter, setGradeFilter] = useState<GradeLevel | 'all'>('all');
    const [showHiddenSection, setShowHiddenSection] = useState(false);

    const trimmedQuery = searchQuery.trim();
    const isFiltering =
      trimmedQuery !== '' || categoryFilter !== 'all' || gradeFilter !== 'all';

    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8,
        },
      })
    );

    useClickOutside(
      ref as React.RefObject<HTMLDivElement>,
      onClose,
      triggerRef ? [triggerRef] : []
    );

    // Portalled outside any `.widget`/Modal ancestor — stop Escape reaching DashboardView's global handler.
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        if (isEscapeFromWidgetInput(event)) return;
        event.stopPropagation();
        onClose();
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleResetDock = useCallback(async () => {
      const confirmed = await showConfirm(
        'Are you sure you want to reset your dock? This will remove your current dock layout and restore the default widgets for your building.',
        {
          title: 'Reset Dock to Defaults',
          confirmLabel: 'Reset Dock',
          cancelLabel: 'Cancel',
        }
      );

      if (confirmed) {
        resetDockToDefaults();
        onClose();
      }
    }, [showConfirm, resetDockToDefaults, onClose]);

    // Merge any new TOOLS not yet tracked in libraryOrder (auto-discovery)
    const effectiveOrder = useMemo(() => {
      const allToolTypes = TOOLS.map((t) => t.type);
      return [
        ...libraryOrder,
        ...allToolTypes.filter((type) => !libraryOrder.includes(type)),
      ];
    }, [libraryOrder]);

    const handleDragEnd = useCallback(
      (event: DragEndEvent) => {
        endWidgetDrag();
        const { active, over } = event;
        if (over && active.id !== over.id) {
          const oldIndex = effectiveOrder.indexOf(
            active.id as WidgetType | InternalToolType
          );
          const newIndex = effectiveOrder.indexOf(
            over.id as WidgetType | InternalToolType
          );
          onReorderLibrary(arrayMove(effectiveOrder, oldIndex, newIndex));
        }
      },
      [effectiveOrder, onReorderLibrary]
    );

    // Tools the user could add given their role + building — NOT accounting
    // for what's already in the dock. Used to distinguish "your buildings
    // match nothing" from "everything that matches is already in your dock"
    // in the empty state, which otherwise always blamed the building filter.
    const buildingAccessibleTools = useMemo(() => {
      return effectiveOrder
        .map((type) => TOOLS_MAP.get(type))
        .filter((tool): tool is (typeof TOOLS)[0] => {
          if (!tool) return false;
          if (!canAccess(tool.type)) return false;
          if (
            !isEditMode &&
            matchesUserBuilding &&
            !matchesUserBuilding(tool.type)
          )
            return false;
          return true;
        });
    }, [effectiveOrder, canAccess, isEditMode, matchesUserBuilding]);

    // Filter tools: must be accessible AND NOT already in the dock,
    // and in normal mode must match the user's selected buildings
    const availableTools = useMemo(() => {
      const visibleToolsSet = new Set(visibleTools);
      return buildingAccessibleTools.filter(
        (tool) => !visibleToolsSet.has(tool.type)
      );
    }, [buildingAccessibleTools, visibleTools]);

    // Category + grade filters (search is applied separately via Fuse below)
    const categoryGradeFiltered = useMemo(() => {
      return availableTools.filter((tool) => {
        if (categoryFilter !== 'all' && tool.category !== categoryFilter)
          return false;
        if (gradeFilter !== 'all' && getToolGradeLevels) {
          if (!getToolGradeLevels(tool.type).includes(gradeFilter))
            return false;
        }
        return true;
      });
    }, [availableTools, categoryFilter, gradeFilter, getToolGradeLevels]);

    // Fuzzy search over admin-aware label + curated keywords
    const searchedTools = useMemo(() => {
      if (trimmedQuery === '') return categoryGradeFiltered;
      const fuse = new Fuse(
        categoryGradeFiltered.map((tool) => ({
          tool,
          label: getToolLabel ? getToolLabel(tool.type) : tool.label,
          keywords: tool.keywords ?? [],
        })),
        {
          keys: [
            { name: 'label', weight: 2 },
            { name: 'keywords', weight: 1 },
          ],
          threshold: 0.35,
          ignoreLocation: true,
        }
      );
      return fuse.search(trimmedQuery).map((r) => r.item.tool);
    }, [categoryGradeFiltered, trimmedQuery, getToolLabel]);

    const hiddenToolsSet = useMemo(() => new Set(hiddenTools), [hiddenTools]);

    // Default view excludes hidden tools; an active search surfaces them
    // (marked hidden) so search stays the recovery path for hidden widgets.
    const shownTools = useMemo(
      () =>
        trimmedQuery !== ''
          ? searchedTools
          : searchedTools.filter((t) => !hiddenToolsSet.has(t.type)),
      [searchedTools, trimmedQuery, hiddenToolsSet]
    );

    // Hidden tools among the user's accessible set, for the "Hidden" section
    // (only shown when not searching — search already surfaces them inline).
    const hiddenSectionTools = useMemo(
      () => categoryGradeFiltered.filter((t) => hiddenToolsSet.has(t.type)),
      [categoryGradeFiltered, hiddenToolsSet]
    );

    // Reordering a filtered subset would scramble libraryOrder — only allow
    // dragging when the full, unfiltered list is on screen.
    const sortDisabled = isFiltering;

    const savedMatches = useMemo(() => {
      if (trimmedQuery === '') return isFiltering ? [] : savedWidgets;
      const fuse = new Fuse(savedWidgets, {
        keys: ['title'],
        threshold: 0.35,
        ignoreLocation: true,
      });
      return fuse.search(trimmedQuery).map((r) => r.item);
    }, [savedWidgets, trimmedQuery, isFiltering]);

    const customMatches = useMemo(() => {
      if (trimmedQuery === '') return isFiltering ? [] : customWidgets;
      const fuse = new Fuse(customWidgets, {
        keys: ['title'],
        threshold: 0.35,
        ignoreLocation: true,
      });
      return fuse.search(trimmedQuery).map((r) => r.item);
    }, [customWidgets, trimmedQuery, isFiltering]);

    // "Built-in" qualifier matters because custom widgets render in their
    // own section above and aren't counted here — without it, the message
    // reads as a lie whenever there are still custom widgets to add.
    // Edit mode bypasses the building filter entirely, so wording has to
    // fork on isEditMode as well.
    const emptyStateMessage = isFiltering
      ? 'No widgets match your search'
      : buildingAccessibleTools.length === 0
        ? isEditMode
          ? 'No built-in widgets available with your current access'
          : 'No built-in widgets available for your selected buildings'
        : 'All built-in widgets are in your dock';

    return createPortal(
      <div className="fixed inset-0 z-modal flex items-center justify-center p-4 animate-in fade-in duration-200 pointer-events-none">
        <GlassCard
          ref={ref}
          globalStyle={globalStyle}
          transparency={0.98}
          className="w-full max-w-2xl h-[560px] max-h-[75vh] overflow-hidden flex flex-col p-0 shadow-2xl animate-in zoom-in-95 duration-300 select-none pointer-events-auto"
        >
          <div className="bg-white/50 px-6 py-4 border-b border-white/30 flex justify-between items-center shrink-0 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-brand-blue-primary" />
                <h3 className="font-black text-sm uppercase tracking-wider text-slate-800">
                  Widget Library
                </h3>
              </div>
              {!isEditMode && onEnterEditMode && (
                <button
                  onClick={onEnterEditMode}
                  className="px-3 py-1.5 bg-brand-blue-primary/10 hover:bg-brand-blue-primary/20 text-brand-blue-primary text-xxs font-black uppercase tracking-widest rounded-full transition-all flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
              {isEditMode && onAddFolder && (
                <button
                  onClick={onAddFolder}
                  className="px-3 py-1.5 bg-brand-blue-primary/10 hover:bg-brand-blue-primary/20 text-brand-blue-primary text-xxs font-black uppercase tracking-widest rounded-full transition-all flex items-center gap-1.5"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  Add Folder
                </button>
              )}
            </div>
            <IconButton
              onClick={onClose}
              icon={<X className="w-5 h-5" />}
              label="Close Library"
              variant="ghost"
              size="md"
            />
          </div>
          {/* Search + filters */}
          <div className="bg-white/40 px-6 py-3 border-b border-white/30 shrink-0 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search widgets…"
                aria-label="Search widgets"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/80 border border-white/60 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as WidgetCategory | 'all')
                }
                aria-label="Filter by category"
                className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-white/80 border border-white/60 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
              >
                <option value="all">All Categories</option>
                {WIDGET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                value={gradeFilter}
                onChange={(e) =>
                  setGradeFilter(e.target.value as GradeLevel | 'all')
                }
                aria-label="Filter by grade level"
                className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-white/80 border border-white/60 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
              >
                {GRADE_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
            {savedMatches.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Bookmark className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                    My Saved Widgets
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {savedMatches.map((sw) => {
                    const Icon = getCustomWidgetIcon(sw.icon) ?? Puzzle;
                    return (
                      <div
                        key={sw.id}
                        className="relative group flex flex-col items-center gap-2 p-3 rounded-xl bg-white/60 border border-white/40 hover:bg-white hover:shadow-md transition-all text-center"
                      >
                        {/* Top-left: delete (with confirm) */}
                        {onDeleteSavedWidget && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSavedWidget(sw.id);
                            }}
                            className="absolute top-1 left-1 p-1 rounded-md text-slate-400 hover:text-brand-red-primary hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                            aria-label="Delete saved widget"
                            title="Delete saved widget"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* Top-right: pin toggle */}
                        {onToggleSavedWidgetPin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSavedWidgetPin(sw.id, !sw.pinnedToDock);
                            }}
                            className={`absolute top-1 right-1 p-1 rounded-md transition-all ${
                              sw.pinnedToDock
                                ? 'text-brand-blue-primary opacity-100'
                                : 'text-slate-400 hover:text-brand-blue-primary opacity-0 group-hover:opacity-100'
                            }`}
                            aria-label={
                              sw.pinnedToDock
                                ? 'Unpin from dock'
                                : 'Pin to dock'
                            }
                            title={
                              sw.pinnedToDock
                                ? 'Unpin from dock'
                                : 'Pin to dock'
                            }
                          >
                            {sw.pinnedToDock ? (
                              <Pin className="w-3.5 h-3.5" />
                            ) : (
                              <PinOff className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onAddSavedWidget?.(sw.id);
                            onClose();
                          }}
                          className="flex flex-col items-center gap-2 w-full focus:outline-none"
                        >
                          <div
                            className={`w-10 h-10 rounded-xl ${sw.color} flex items-center justify-center text-white shadow-sm group-hover:scale-110 transition-transform`}
                          >
                            <Icon size={20} />
                          </div>
                          <span className="text-xs font-semibold text-slate-700 leading-tight line-clamp-2">
                            {sw.title}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {customMatches.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Puzzle className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                    Custom Widgets
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {customMatches.map((w) => {
                    const Icon = getCustomWidgetIcon(w.icon);
                    return (
                      <button
                        key={w.id}
                        onClick={() => {
                          onAddCustomWidget?.(w.id);
                          onClose();
                        }}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/60 border border-white/40 hover:bg-white hover:shadow-md transition-all text-center group"
                      >
                        <div
                          className={`w-10 h-10 rounded-xl ${w.color} flex items-center justify-center text-xl text-white shadow-sm group-hover:scale-110 transition-transform`}
                        >
                          {Icon ? <Icon size={20} /> : w.icon}
                        </div>
                        <span className="text-xs font-semibold text-slate-700 leading-tight line-clamp-2">
                          {w.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {shownTools.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={beginWidgetDrag}
                onDragEnd={handleDragEnd}
                onDragCancel={endWidgetDrag}
              >
                <SortableContext
                  items={shownTools.map((t) => t.type)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {shownTools.map((tool) => (
                      <SortableLibraryTool
                        key={tool.type}
                        tool={tool}
                        isActive={false} // They are always inactive now due to filtering
                        isEditMode={isEditMode}
                        isHidden={hiddenToolsSet.has(tool.type)}
                        sortDisabled={sortDisabled}
                        onToggle={onToggle}
                        onToggleHidden={toggleToolHidden}
                        onLongPress={onEnterEditMode}
                        label={
                          getToolLabel ? getToolLabel(tool.type) : undefined
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                <LayoutGrid className="w-12 h-12 mb-4 text-slate-400" />
                <p className="text-sm font-black uppercase tracking-widest text-slate-600">
                  {emptyStateMessage}
                </p>
              </div>
            )}
            {/* Hidden widgets — collapsed by default; search surfaces them inline instead */}
            {trimmedQuery === '' && hiddenSectionTools.length > 0 && (
              <div>
                <button
                  onClick={() => setShowHiddenSection((prev) => !prev)}
                  className="flex items-center gap-2 mb-3 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-expanded={showHiddenSection}
                >
                  {showHiddenSection ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <EyeOff className="w-3.5 h-3.5" />
                  <span className="text-xxs font-bold uppercase tracking-widest">
                    Hidden ({hiddenSectionTools.length})
                  </span>
                </button>
                {showHiddenSection && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {hiddenSectionTools.map((tool) => (
                      <SortableLibraryTool
                        key={tool.type}
                        tool={tool}
                        isActive={false}
                        isEditMode={isEditMode}
                        isHidden
                        sortDisabled
                        onToggle={onToggle}
                        onToggleHidden={toggleToolHidden}
                        label={
                          getToolLabel ? getToolLabel(tool.type) : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="bg-slate-50/50 px-6 py-3 border-t border-white/30 text-center backdrop-blur-xl space-y-3">
            <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
              {shownTools.length > 0
                ? isFiltering
                  ? isEditMode
                    ? 'Tap to add to dock • Clear search to reorder'
                    : 'Tap to add to board • Clear search to reorder'
                  : isEditMode
                    ? 'Drag to reorder • Tap to add to dock'
                    : 'Drag to reorder • Tap to add to board'
                : emptyStateMessage}
            </p>

            <button
              onClick={handleResetDock}
              className="w-full max-w-xs mx-auto py-2 px-4 bg-white/50 border border-slate-200 text-slate-500 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-white hover:text-brand-red-primary hover:border-brand-red-light transition-all shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Dock to Defaults
            </button>
          </div>
        </GlassCard>
      </div>,
      document.body
    );
  }
);

WidgetLibrary.displayName = 'WidgetLibrary';

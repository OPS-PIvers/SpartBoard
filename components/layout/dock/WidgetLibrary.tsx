import React, { forwardRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutGrid,
  Plus,
  X,
  FolderPlus,
  RotateCcw,
  Puzzle,
} from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { getCustomWidgetIcon } from '@/config/customWidgetIcons';
import { CustomWidgetDoc } from '@/types';
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
import { TOOLS } from '@/config/tools';
import { WidgetType, GlobalStyle, InternalToolType } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { beginWidgetDrag, endWidgetDrag } from '@/utils/widgetDragFlag';

// O(1) Lookup Map for TOOLS optimization.
// Extracted outside the component to prevent recreating the map on every mount.
const TOOLS_MAP = new Map<WidgetType | InternalToolType, (typeof TOOLS)[0]>(
  TOOLS.map((t) => [t.type, t])
);

interface WidgetLibraryProps {
  onToggle: (type: WidgetType | InternalToolType) => void;
  visibleTools: (WidgetType | InternalToolType)[];
  canAccess: (type: WidgetType | InternalToolType) => boolean;
  /** In normal (non-edit) mode, only widgets returning true are shown */
  matchesUserBuilding?: (type: WidgetType | InternalToolType) => boolean;
  onClose: () => void;
  globalStyle: GlobalStyle;
  triggerRef?: React.RefObject<HTMLElement | null>;
  libraryOrder: (WidgetType | InternalToolType)[];
  onReorderLibrary: (tools: (WidgetType | InternalToolType)[]) => void;
  isEditMode?: boolean;
  onAddFolder?: () => void;
  getToolLabel?: (type: WidgetType | InternalToolType) => string;
  /** Published custom widgets to show as an additional section */
  customWidgets?: CustomWidgetDoc[];
  /** Called when a custom widget card is clicked */
  onAddCustomWidget?: (customWidgetId: string) => void;
}

const SortableLibraryTool = React.memo(
  ({
    tool,
    isActive,
    isEditMode,
    onToggle,
    label,
  }: {
    tool: (typeof TOOLS)[0];
    isActive: boolean;
    isEditMode: boolean;
    onToggle: (type: WidgetType | InternalToolType) => void;
    label?: string;
  }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: tool.type });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? Z_INDEX.itemDragging : 1,
    };

    return (
      <button
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          // Prevent click if dragging happened
          if (e.defaultPrevented) return;
          onToggle(tool.type);
        }}
        className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition-all group active:scale-95 border-2 ${
          isActive
            ? 'bg-white/80 border-brand-blue-primary shadow-md'
            : 'bg-white/20 border-transparent opacity-100 hover:bg-white/30'
        } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${isEditMode ? 'animate-jiggle' : ''}`}
      >
        <div
          className={`${tool.color} p-3 rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform relative`}
        >
          <tool.icon className="w-6 h-6" />
          {isEditMode && (
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
      onClose,
      globalStyle,
      triggerRef,
      libraryOrder,
      onReorderLibrary,
      isEditMode = false,
      onAddFolder,
      getToolLabel,
      customWidgets = [],
      onAddCustomWidget,
    },
    ref
  ) => {
    const { showConfirm } = useDialog();
    const { resetDockToDefaults } = useDashboard();

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

    // Filter tools: must be accessible AND NOT already in the dock,
    // and in normal mode must match the user's selected buildings
    const availableTools = useMemo(() => {
      const visibleToolsSet = new Set(visibleTools);
      return (
        effectiveOrder
          // Replaced TOOLS.find with TOOLS_MAP.get to eliminate O(N^2) complexity in rendering loop.
          .map((type) => TOOLS_MAP.get(type))
          .filter((tool): tool is (typeof TOOLS)[0] => {
            if (!tool) return false;
            if (!canAccess(tool.type)) return false;
            // Hide if already in the dock
            if (visibleToolsSet.has(tool.type)) return false;
            // In normal (non-edit) mode, apply building-based grade-level filter
            if (
              !isEditMode &&
              matchesUserBuilding &&
              !matchesUserBuilding(tool.type)
            )
              return false;
            return true;
          })
      );
    }, [
      effectiveOrder,
      visibleTools,
      canAccess,
      isEditMode,
      matchesUserBuilding,
    ]);

    return createPortal(
      <div className="fixed inset-0 z-modal flex items-center justify-center p-4 animate-in fade-in duration-200 pointer-events-none">
        <GlassCard
          ref={ref}
          globalStyle={globalStyle}
          transparency={0.98}
          className="w-full max-w-2xl h-[520px] max-h-[70vh] overflow-hidden flex flex-col p-0 shadow-2xl animate-in zoom-in-95 duration-300 select-none pointer-events-auto"
        >
          <div className="bg-white/50 px-6 py-4 border-b border-white/30 flex justify-between items-center shrink-0 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-brand-blue-primary" />
                <h3 className="font-black text-sm uppercase tracking-wider text-slate-800">
                  Widget Library
                </h3>
              </div>
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
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
            {customWidgets.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Puzzle className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                    Custom Widgets
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {customWidgets.map((w) => {
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
            {availableTools.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={beginWidgetDrag}
                onDragEnd={handleDragEnd}
                onDragCancel={endWidgetDrag}
              >
                <SortableContext
                  items={availableTools.map((t) => t.type)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {availableTools.map((tool) => (
                      <SortableLibraryTool
                        key={tool.type}
                        tool={tool}
                        isActive={false} // They are always inactive now due to filtering
                        isEditMode={isEditMode}
                        onToggle={onToggle}
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
                  {isEditMode
                    ? 'All widgets are in your dock'
                    : 'No widgets available for your buildings'}
                </p>
              </div>
            )}
          </div>
          <div className="bg-slate-50/50 px-6 py-3 border-t border-white/30 text-center backdrop-blur-xl space-y-3">
            <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
              {availableTools.length > 0
                ? isEditMode
                  ? 'Drag to reorder • Tap to add to dock'
                  : 'Drag to reorder • Tap to add to board'
                : isEditMode
                  ? 'All widgets are in your dock'
                  : 'No widgets available for your selected buildings'}
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

import React, { forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid, Plus, X, FolderPlus } from 'lucide-react';
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
import { GlassCard } from '../../common/GlassCard';
import { IconButton } from '@/components/common/IconButton';
import { TOOLS } from '../../../config/tools';
import { WidgetType, GlobalStyle, InternalToolType } from '../../../types';
import { useClickOutside } from '../../../hooks/useClickOutside';

interface WidgetLibraryProps {
  onToggle: (type: WidgetType | InternalToolType) => void;
  visibleTools: (WidgetType | InternalToolType)[];
  canAccess: (type: WidgetType | InternalToolType) => boolean;
  onClose: () => void;
  globalStyle: GlobalStyle;
  triggerRef?: React.RefObject<HTMLElement | null>;
  libraryOrder: (WidgetType | InternalToolType)[];
  onReorderLibrary: (tools: (WidgetType | InternalToolType)[]) => void;
  isEditMode?: boolean;
  onAddFolder?: () => void;
}

const SortableLibraryTool = ({
  tool,
  isActive,
  isEditMode,
  onToggle,
}: {
  tool: (typeof TOOLS)[0];
  isActive: boolean;
  isEditMode: boolean;
  onToggle: () => void;
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
    zIndex: isDragging ? 100 : 1,
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
        onToggle();
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
        {tool.label}
      </span>
    </button>
  );
};

export const WidgetLibrary = forwardRef<HTMLDivElement, WidgetLibraryProps>(
  (
    {
      onToggle,
      visibleTools,
      canAccess,
      onClose,
      globalStyle,
      triggerRef,
      libraryOrder,
      onReorderLibrary,
      isEditMode = false,
      onAddFolder,
    },
    ref
  ) => {
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

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = libraryOrder.indexOf(
          active.id as WidgetType | InternalToolType
        );
        const newIndex = libraryOrder.indexOf(
          over.id as WidgetType | InternalToolType
        );
        onReorderLibrary(arrayMove(libraryOrder, oldIndex, newIndex));
      }
    };

    // Filter tools: must be accessible AND NOT already in the dock
    const availableTools = libraryOrder
      .map((type) => TOOLS.find((t) => t.type === type))
      .filter((tool): tool is (typeof TOOLS)[0] => {
        if (!tool) return false;
        if (!canAccess(tool.type)) return false;
        // Hide if already in the dock
        return !visibleTools.includes(tool.type);
      });

    return createPortal(
      <div className="fixed inset-0 z-modal flex items-center justify-center p-4 animate-in fade-in duration-200 pointer-events-none">
        <GlassCard
          ref={ref}
          globalStyle={globalStyle}
          transparency={0.98}
          className="w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 shadow-2xl animate-in zoom-in-95 duration-300 select-none pointer-events-auto"
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
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {availableTools.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
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
                        onToggle={() => onToggle(tool.type)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                <LayoutGrid className="w-12 h-12 mb-4 text-slate-400" />
                <p className="text-sm font-black uppercase tracking-widest text-slate-600">
                  All widgets are in your dock
                </p>
              </div>
            )}
          </div>
          <div className="bg-slate-50/50 px-6 py-3 border-t border-white/30 text-center backdrop-blur-xl">
            <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
              {availableTools.length > 0
                ? isEditMode
                  ? 'Drag to reorder • Tap to add to dock'
                  : 'Drag to reorder • Tap to add to board'
                : 'Remove items from dock to see them here'}
            </p>
          </div>
        </GlassCard>
      </div>,
      document.body
    );
  }
);

WidgetLibrary.displayName = 'WidgetLibrary';

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FolderPlus, X } from 'lucide-react';
import { useSortable, SortableContext, arrayMove } from '@dnd-kit/sortable';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { GlassCard } from '../../common/GlassCard';
import { DockIcon } from './DockIcon';
import { DockLabel } from './DockLabel';
import { SortableFolderWidget } from './SortableFolderWidget';
import { TOOLS } from '../../../config/tools';
import { Z_INDEX } from '../../../config/zIndex';
import {
  DockFolder,
  WidgetType,
  GlobalStyle,
  WidgetData,
  InternalToolType,
} from '../../../types';

interface FolderItemProps {
  folder: DockFolder;
  onAdd: (type: WidgetType | InternalToolType) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  isEditMode: boolean;
  onLongPress: () => void;
  minimizedWidgetsByType: Record<WidgetType, WidgetData[]>;
  onRemoveItem: (folderId: string, type: WidgetType | InternalToolType) => void;
  onReorder: (
    folderId: string,
    newItems: (WidgetType | InternalToolType)[]
  ) => void;
  globalStyle: GlobalStyle;
}

// Folder Item Component
export const FolderItem = React.memo(
  ({
    folder,
    onAdd,
    onRename,
    onDelete,
    isEditMode,
    onLongPress,
    minimizedWidgetsByType,
    onRemoveItem,
    onReorder,
    globalStyle,
  }: FolderItemProps) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({
      id: folder.id,
      disabled: !isEditMode,
    });

    const [showPopover, setShowPopover] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);

    // DND Sensors for internal folder sorting
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 5,
        },
      })
    );

    useClickOutside(popoverRef, () => setShowPopover(false), [buttonRef]);

    const handlePointerDown = (e: React.PointerEvent) => {
      listeners?.onPointerDown?.(e);
      if (isEditMode) return;
      longPressTimer.current = setTimeout(() => {
        onLongPress();
      }, 600);
    };

    const handlePointerUp = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event;
      if (active.id !== over?.id) {
        const oldIndex = folder.items.indexOf(
          active.id as WidgetType | InternalToolType
        );
        const newIndex = folder.items.indexOf(
          over?.id as WidgetType | InternalToolType
        );
        if (oldIndex !== -1 && newIndex !== -1) {
          onReorder(folder.id, arrayMove(folder.items, oldIndex, newIndex));
        }
      }
    };

    const style = {
      transform: CSS.Translate.toString(transform),
      transition,
      opacity: isDragging ? 0.3 : 1,
      zIndex: isDragging ? Z_INDEX.dockDragging : 'auto',
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="relative flex flex-col items-center"
      >
        {showPopover &&
          createPortal(
            <GlassCard
              globalStyle={globalStyle}
              ref={popoverRef}
              className="fixed bottom-32 left-1/2 -translate-x-1/2 w-64 p-4 animate-in slide-in-from-bottom-2 duration-200 z-popover"
            >
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-xxs font-black uppercase text-slate-500 tracking-widest">
                  {folder.name}
                </h4>
                <button
                  onClick={() => {
                    onRename(folder.id);
                    setShowPopover(false);
                  }}
                  className="text-xxxs font-black uppercase tracking-widest text-brand-blue-primary hover:underline"
                >
                  Rename
                </button>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={folder.items}>
                  <div className="grid grid-cols-3 gap-3">
                    {folder.items.map((type) => {
                      const tool = TOOLS.find((t) => t.type === type);
                      if (!tool) return null;

                      // Internal tools don't have minimized widgets
                      const minimizedCount =
                        type === 'record' || type === 'magic'
                          ? 0
                          : (minimizedWidgetsByType[type as WidgetType]
                              ?.length ?? 0);

                      return (
                        <SortableFolderWidget
                          key={type}
                          type={type}
                          tool={tool}
                          minimizedCount={minimizedCount}
                          isEditMode={isEditMode}
                          onRemove={() => onRemoveItem(folder.id, type)}
                          onAdd={() => {
                            onAdd(type);
                            setShowPopover(false);
                          }}
                          onLongPress={onLongPress}
                        />
                      );
                    })}
                    {folder.items.length === 0 && (
                      <div className="col-span-3 py-4 text-center text-xxs text-slate-400 italic">
                        Drag items here to add them
                      </div>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </GlassCard>,
            document.body
          )}

        <div
          className={`relative group/folder ${isEditMode ? 'animate-jiggle' : ''}`}
          data-folder-id={folder.id}
        >
          {isEditMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(folder.id);
              }}
              className="absolute -top-2 -right-2 z-50 bg-red-500 text-white rounded-full p-1 shadow-md hover:scale-110 transition-all"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}

          <button
            ref={buttonRef}
            {...attributes}
            {...listeners}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onClick={() => setShowPopover(true)}
            className={`group flex flex-col items-center gap-1 min-w-[50px] transition-transform active:scale-90 relative ${
              isEditMode
                ? 'cursor-grab active:cursor-grabbing touch-none'
                : 'touch-pan-x'
            }`}
          >
            <DockIcon
              color="bg-slate-200/50"
              className="backdrop-blur-md shadow-inner border border-white/20 grid grid-cols-2 gap-0.5 overflow-hidden group-hover:bg-slate-200/80 transition-colors p-1.5"
            >
              {folder.items.slice(0, 4).map((type, i) => {
                const tool = TOOLS.find((t) => t.type === type);
                return (
                  <div
                    key={`${type}-${i}`}
                    className={`${tool?.color ?? 'bg-slate-400'} w-full h-full rounded-[3px]`}
                  />
                );
              })}
              {folder.items.length === 0 && (
                <div className="col-span-2 row-span-2 flex items-center justify-center opacity-20 text-slate-600">
                  <FolderPlus className="w-4 h-4" />
                </div>
              )}
            </DockIcon>
            <DockLabel>{folder.name}</DockLabel>
          </button>
        </div>
      </div>
    );
  }
);

FolderItem.displayName = 'FolderItem';

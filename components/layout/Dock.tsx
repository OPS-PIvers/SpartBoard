import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Users, Cast, Square } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  rectIntersection,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDashboard } from '../../context/useDashboard';
import { useAuth } from '../../context/useAuth';
import { useLiveSession } from '../../hooks/useLiveSession';
import { useClickOutside } from '../../hooks/useClickOutside';
import { WidgetType, WidgetData, DockFolder, MiniAppItem } from '../../types';
import { TOOLS } from '../../config/tools';
import { isLunchCountBuilding } from '../../config/buildings';
import { AddWidgetOverrides } from '../../types';
import { getJoinUrl } from '../../utils/urlHelpers';
import ClassRosterMenu from './ClassRosterMenu';
import { GlassCard } from '../common/GlassCard';
import { DEFAULT_GLOBAL_STYLE } from '../../types';
import { Z_INDEX } from '../../config/zIndex';
import { WidgetLibrary } from './dock/WidgetLibrary';
import { RenameFolderModal } from './dock/RenameFolderModal';
import { MagicLayoutModal } from './dock/MagicLayoutModal';
import { detectWidgetType } from '../../utils/smartPaste';
import { useImageUpload } from '../../hooks/useImageUpload';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { DockIcon } from './dock/DockIcon';
import { DockLabel } from './dock/DockLabel';
import { ToolDockItem } from './dock/ToolDockItem';
import { FolderItem } from './dock/FolderItem';
import { QuickAccessButton } from './dock/QuickAccessButton';
import { useScreenRecord } from '../../hooks/useScreenRecord';
import { useGoogleDrive } from '../../hooks/useGoogleDrive';

export const Dock: React.FC = () => {
  const { t } = useTranslation();
  const {
    addWidget,
    removeWidget,
    removeWidgets,
    visibleTools,
    dockItems,
    reorderDockItems,
    activeDashboard,
    updateWidget,
    toggleToolVisibility,
    reorderLibrary,
    libraryOrder,
    addFolder,
    renameFolder,
    deleteFolder,
    addItemToFolder,
    moveItemOutOfFolder,
    reorderFolderItems,
    addToast,
  } = useDashboard();
  const {
    canAccessWidget,
    canAccessFeature,
    user,
    userGradeLevels,
    selectedBuildings,
  } = useAuth();
  const { driveService } = useGoogleDrive();

  const getBuildingAwareOverrides = useCallback(
    (type: WidgetType): AddWidgetOverrides | undefined => {
      if (type === 'expectations') {
        const isElementaryOnly =
          userGradeLevels.length > 0 &&
          userGradeLevels.every((gl) => gl === 'k-2' || gl === '3-5');
        if (isElementaryOnly) {
          return { config: { layout: 'elementary' } };
        }
      }
      if (type === 'lunchCount') {
        const schoolBuilding = selectedBuildings.find(isLunchCountBuilding);
        if (schoolBuilding) {
          return { config: { schoolSite: schoolBuilding } };
        }
      }
      return undefined;
    },
    [userGradeLevels, selectedBuildings]
  );

  const handleRecordingComplete = useCallback(
    async (blob: Blob) => {
      const fileName = `SPART-Board-Recording-${new Date().toISOString()}.webm`;

      if (driveService) {
        addToast(t('dock.uploadingToDrive'), 'info');
        try {
          await driveService.uploadFile(blob, fileName, 'Recordings');
          addToast(t('dock.recordingSavedToDrive'), 'success');
        } catch (err) {
          console.error('Failed to upload recording:', err);
          addToast(t('dock.recordingDriveFailed'), 'error');
          // Fallback to local download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
        }
      } else {
        addToast(t('dock.noGoogleDrive'), 'info');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    },
    [driveService, addToast, t]
  );

  const { isRecording, duration, startRecording, stopRecording } =
    useScreenRecord({
      onSuccess: handleRecordingComplete,
      onError: (err) => {
        addToast(err.message, 'error');
      },
    });

  const { session } = useLiveSession(user?.uid, 'teacher');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRosterMenu, setShowRosterMenu] = useState(false);
  const [showLiveInfo, setShowLiveInfo] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // Global Edit Mode State
  const [showLibrary, setShowLibrary] = useState(false); // Widget Library Visibility
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showMagicLayout, setShowMagicLayout] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Drag-to-collapse state
  const [dragY, setDragY] = useState(0);
  const [isDraggingDown, setIsDraggingDown] = useState(false);
  const startY = useRef(0);
  const threshold = 80; // Distance to trigger collapse

  const handleDockPointerDown = (e: React.PointerEvent) => {
    if (!isExpanded || isEditMode) return;
    // Don't drag if clicking a button or interactive element
    if ((e.target as HTMLElement).closest('button')) return;

    setIsDraggingDown(true);
    startY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDockPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingDown) return;
    const deltaY = e.clientY - startY.current;
    // Only allow dragging downwards
    if (deltaY > 0) {
      setDragY(deltaY);
    }
  };

  const handleDockPointerUp = (e: React.PointerEvent) => {
    if (!isDraggingDown) return;
    setIsDraggingDown(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    if (dragY > threshold) {
      setIsExpanded(false);
    }
    setDragY(0);
  };

  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;

  const { processAndUploadImage } = useImageUpload();

  // Smart Paste Handler
  useEffect(() => {
    if (!canAccessFeature('smart-paste')) return;

    const handlePaste = async (e: ClipboardEvent) => {
      // Don't intercept if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        e.defaultPrevented // Respect existing handlers (e.g. StickerBook)
      ) {
        return;
      }

      // 1. Handle Image Paste
      if (e.clipboardData?.files?.length) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith('image/')) {
          if (!user) {
            addToast('Please sign in to add stickers', 'error');
            return;
          }
          addToast('Processing image...', 'info');
          const url = await processAndUploadImage(file);
          if (url) {
            addWidget('sticker', { config: { url, rotation: 0 } });
            addToast('Sticker added!', 'success');
          } else {
            addToast('Failed to process image', 'error');
          }
          return;
        }
      }

      // 2. Handle Text Paste
      const text = e.clipboardData?.getData('text');
      if (text) {
        const result = detectWidgetType(text);
        if (result) {
          if (result.action === 'create-widget') {
            addWidget(result.type, {
              config: result.config,
              ...(result.title ? { customTitle: result.title } : {}),
            });
            addToast(
              `Added ${result.type.charAt(0).toUpperCase() + result.type.slice(1)} widget!`,
              'success'
            );
          } else if (result.action === 'import-board') {
            // Navigate to the share URL to trigger import
            window.location.href = result.url;
          } else if (result.action === 'create-mini-app') {
            if (user) {
              addToast('Creating Mini App...', 'info');
              const id = crypto.randomUUID();
              const newItem: MiniAppItem = {
                id,
                title: result.title ?? 'Untitled App',
                html: result.html,
                createdAt: Date.now(),
                order: 0, // Will be sorted by createdAt usually
              };

              // Save to Firestore (library)
              try {
                await setDoc(
                  doc(db, 'users', user.uid, 'miniapps', id),
                  newItem
                );

                // Open the widget immediately
                addWidget('miniApp', { config: { activeApp: newItem } });
                addToast('Mini App saved to library!', 'success');
              } catch (err) {
                console.error(err);
                addToast('Failed to save Mini App', 'error');
              }
            } else {
              addToast('Sign in to create Mini Apps', 'error');
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addWidget, addToast, canAccessFeature, processAndUploadImage, user]);

  const classesButtonRef = useRef<HTMLButtonElement>(null);
  const liveButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [classesAnchorRect, setClassesAnchorRect] = useState<DOMRect | null>(
    null
  );
  const [livePopoverPos, setLivePopoverPos] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  const livePopoverRef = useRef<HTMLDivElement>(null);
  const dockContainerRef = useRef<HTMLDivElement>(null); // Ref for click-outside detection
  const libraryRef = useRef<HTMLDivElement>(null); // Ref for widget library

  // Close live popover when clicking outside
  useClickOutside(livePopoverRef, () => {
    if (showLiveInfo) setShowLiveInfo(false);
  }, [liveButtonRef]);

  // Handle exiting edit mode when clicking outside the dock area
  useClickOutside(dockContainerRef, () => {
    if (
      (isEditMode || showMoreMenu) &&
      !renamingFolderId &&
      !showCreateFolderModal
    ) {
      setIsEditMode(false);
      setShowLibrary(false);
      setShowMoreMenu(false);
    }
  }, [libraryRef]);

  const openClassEditor = () => {
    addWidget('classes');
    setShowRosterMenu(false);
  };

  const handleToggleRosterMenu = () => {
    if (!showRosterMenu && classesButtonRef.current) {
      setClassesAnchorRect(classesButtonRef.current.getBoundingClientRect());
    }
    setShowRosterMenu(!showRosterMenu);
  };

  const handleLongPress = () => {
    setIsEditMode(true);
    setShowLibrary(true);
  };

  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 15, // Require 15px movement to start drag (better for large touch panels)
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveItemId(event.active.id as string);
  };

  /**
   * Custom Collision Detection to handle Grouping vs Reordering
   * If the center of the dragged item is significantly over a folder, we prioritize grouping.
   */
  const customCollisionDetection: CollisionDetection = (args) => {
    const items = dockItems;

    // 1. First, check for folder grouping (rect intersection)
    const folderCollisions = rectIntersection(args).filter((collision) => {
      const item = items.find(
        (i) => i.type === 'folder' && i.folder.id === collision.id
      );

      return !!item;
    });

    if (folderCollisions.length > 0) {
      folderCollisions.sort(
        (a, b) => (b.data?.value ?? 0) - (a.data?.value ?? 0)
      );

      return [folderCollisions[0]];
    }

    // 2. Otherwise, fallback to standard sortable collision (closestCenter)
    return closestCenter(args);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItemId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const items = dockItems;

    // Check if dropping onto a folder
    const overItem = items.find(
      (item) => item.type === 'folder' && item.folder.id === overId
    );

    if (overItem && overItem.type === 'folder' && activeId !== overId) {
      // Find the tool type being dragged
      const activeItem = items.find(
        (item) => item.type === 'tool' && item.toolType === activeId
      );
      if (activeItem && activeItem.type === 'tool') {
        addItemToFolder(overItem.folder.id, activeItem.toolType);
        return;
      }
    }

    // Standard reordering
    if (activeId !== overId) {
      const oldIndex = items.findIndex((item) => {
        const id = item.type === 'tool' ? item.toolType : item.folder.id;
        return id === activeId;
      });
      const newIndex = items.findIndex((item) => {
        const id = item.type === 'tool' ? item.toolType : item.folder.id;
        return id === overId;
      });

      if (oldIndex !== -1 && newIndex !== -1) {
        const next = arrayMove(items, oldIndex, newIndex);
        reorderDockItems(next);
      }
    }
  };

  // Memoize minimized widgets by type to avoid O(N*M) filtering in render loop
  const minimizedWidgetsByType = useMemo(() => {
    const acc = {} as Record<WidgetType, WidgetData[]>;
    if (!activeDashboard) return acc;

    return activeDashboard.widgets.reduce<Record<WidgetType, WidgetData[]>>(
      (prev, widget) => {
        if (widget.minimized) {
          const existing = prev[widget.type] ?? [];
          existing.push(widget);
          prev[widget.type] = existing;
        }
        return prev;
      },
      acc
    );
  }, [activeDashboard]);

  return (
    <div
      ref={dockContainerRef}
      onPointerDown={handleDockPointerDown}
      onPointerMove={handleDockPointerMove}
      onPointerUp={handleDockPointerUp}
      onPointerCancel={handleDockPointerUp}
      data-testid="dock"
      data-screenshot="exclude"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-dock flex flex-col items-center gap-4 transition-all duration-300 select-none ${
        isDraggingDown ? 'transition-none' : 'ease-out'
      }`}
      style={{
        transform: `translateX(-50%) translateY(${dragY}px) scale(${1 - Math.min(dragY / 500, 0.15)})`,
        opacity: 1 - Math.min(dragY / 400, 0.4),
      }}
    >
      {showRosterMenu && (
        <ClassRosterMenu
          onClose={() => setShowRosterMenu(false)}
          onOpenFullEditor={openClassEditor}
          anchorRect={classesAnchorRect}
        />
      )}

      {showCreateFolderModal && (
        <RenameFolderModal
          name=""
          title={t('sidebar.header.createFolder')}
          onClose={() => setShowCreateFolderModal(false)}
          onSave={(newName) => {
            if (newName.trim()) {
              addFolder(newName.trim());
              setShowCreateFolderModal(false);
            }
          }}
          globalStyle={globalStyle}
        />
      )}

      {renamingFolderId && (
        <RenameFolderModal
          name={
            (
              dockItems.find(
                (i) => i.type === 'folder' && i.folder.id === renamingFolderId
              ) as { folder: DockFolder }
            ).folder.name
          }
          onClose={() => setRenamingFolderId(null)}
          onSave={(newName) => {
            if (newName.trim()) {
              renameFolder(renamingFolderId, newName.trim());
              setRenamingFolderId(null);
            }
          }}
          globalStyle={globalStyle}
        />
      )}

      <div className="relative group/dock flex items-center justify-center">
        {/* Expanded View */}
        <div
          className={`transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            isExpanded
              ? 'scale-100 opacity-100 rotate-0'
              : 'scale-50 opacity-0 pointer-events-none absolute translate-y-12 rotate-3'
          }`}
        >
          {/* Widget Library Modal (Triggered by button) */}
          {(showMoreMenu || (isEditMode && showLibrary)) && (
            <WidgetLibrary
              ref={libraryRef}
              visibleTools={visibleTools}
              isEditMode={isEditMode}
              onToggle={(type) => {
                if (isEditMode) {
                  toggleToolVisibility(type);
                } else {
                  addWidget(
                    type as WidgetType,
                    getBuildingAwareOverrides(type as WidgetType)
                  );
                  setShowMoreMenu(false);
                }
              }}
              canAccess={(type) => {
                if (type === 'record')
                  return canAccessFeature('screen-recording');
                if (type === 'magic') return canAccessFeature('magic-layout');
                return canAccessWidget(type as WidgetType);
              }}
              onClose={() => {
                setShowMoreMenu(false);
                setShowLibrary(false);
              }}
              globalStyle={globalStyle}
              triggerRef={dockContainerRef}
              libraryOrder={libraryOrder}
              onReorderLibrary={reorderLibrary}
              onAddFolder={() => setShowCreateFolderModal(true)}
            />
          )}

          {/* Expanded Toolbar with integrated minimize button */}
          <GlassCard
            globalStyle={globalStyle}
            transparency={globalStyle.dockTransparency}
            allowInvisible={true}
            cornerRadius={
              globalStyle.dockBorderRadius === 'full'
                ? 'full'
                : globalStyle.dockBorderRadius === 'none'
                  ? 'none'
                  : globalStyle.dockBorderRadius
            }
            className="relative z-10 px-4 py-3 flex items-center gap-1.5 md:gap-3 max-w-[95vw] overflow-x-auto no-scrollbar flex-nowrap"
          >
            {dockItems.length > 0 ? (
              <>
                <DndContext
                  sensors={sensors}
                  collisionDetection={customCollisionDetection}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={dockItems.map((item) =>
                      item.type === 'tool' ? item.toolType : item.folder.id
                    )}
                    strategy={horizontalListSortingStrategy}
                  >
                    {dockItems.map((item) => {
                      if (item.type === 'tool') {
                        const tool = TOOLS.find(
                          (t) => t.type === item.toolType
                        );
                        if (!tool || !canAccessWidget(tool.type as WidgetType))
                          return null;

                        // Handle special internal tools that aren't standard widgets
                        if (
                          item.toolType === 'record' ||
                          item.toolType === 'magic'
                        ) {
                          if (
                            !canAccessFeature(
                              item.toolType === 'record'
                                ? 'screen-recording'
                                : 'magic-layout'
                            )
                          )
                            return null;

                          return (
                            <ToolDockItem
                              key={item.toolType}
                              tool={tool}
                              minimizedWidgets={[]}
                              onAdd={() => {
                                if (item.toolType === 'record') {
                                  if (isRecording) void stopRecording();
                                  else void startRecording();
                                } else {
                                  setShowMagicLayout(true);
                                }
                              }}
                              onRestore={() => undefined}
                              onDelete={() => undefined}
                              onDeleteAll={() => undefined}
                              onRemoveFromDock={() => {
                                toggleToolVisibility(item.toolType);
                              }}
                              isEditMode={isEditMode}
                              onLongPress={handleLongPress}
                              globalStyle={globalStyle}
                              // Special handling for recording state
                              customColor={
                                item.toolType === 'record' && isRecording
                                  ? 'bg-red-500'
                                  : undefined
                              }
                              customIcon={
                                item.toolType === 'record' && isRecording
                                  ? Square
                                  : undefined
                              }
                              customLabel={
                                item.toolType === 'record' && isRecording
                                  ? `${Math.floor(duration / 60)
                                      .toString()
                                      .padStart(2, '0')}:${(duration % 60)
                                      .toString()
                                      .padStart(2, '0')}`
                                  : undefined
                              }
                            />
                          );
                        }

                        // Handle "classes" as a tool with special popover logic
                        if (item.toolType === 'classes') {
                          const minimizedWidgets =
                            minimizedWidgetsByType[tool.type as WidgetType] ??
                            [];
                          return (
                            <ToolDockItem
                              key={tool.type}
                              tool={tool}
                              minimizedWidgets={minimizedWidgets}
                              onAdd={openClassEditor}
                              onRestore={(id) =>
                                updateWidget(id, { minimized: false })
                              }
                              onDelete={(id) => removeWidget(id)}
                              onDeleteAll={() =>
                                removeWidgets(minimizedWidgets.map((w) => w.id))
                              }
                              onRemoveFromDock={() =>
                                toggleToolVisibility(tool.type)
                              }
                              isEditMode={isEditMode}
                              onLongPress={handleLongPress}
                              globalStyle={globalStyle}
                              onClickOverride={
                                minimizedWidgets.length === 0
                                  ? handleToggleRosterMenu
                                  : undefined
                              }
                              buttonRef={classesButtonRef}
                            />
                          );
                        }

                        const minimizedWidgets =
                          minimizedWidgetsByType[tool.type as WidgetType] ?? [];
                        return (
                          <ToolDockItem
                            key={tool.type}
                            tool={tool}
                            minimizedWidgets={minimizedWidgets}
                            onAdd={() =>
                              addWidget(
                                tool.type as WidgetType,
                                getBuildingAwareOverrides(
                                  tool.type as WidgetType
                                )
                              )
                            }
                            onRestore={(id) =>
                              updateWidget(id, { minimized: false })
                            }
                            onDelete={(id) => removeWidget(id)}
                            onDeleteAll={() => {
                              removeWidgets(minimizedWidgets.map((w) => w.id));
                            }}
                            onRemoveFromDock={() => {
                              toggleToolVisibility(tool.type);
                            }}
                            isEditMode={isEditMode}
                            onLongPress={handleLongPress}
                            globalStyle={globalStyle}
                          />
                        );
                      } else {
                        return (
                          <FolderItem
                            key={item.folder.id}
                            folder={item.folder}
                            onAdd={(type) => {
                              if (type === 'record') {
                                if (isRecording) void stopRecording();
                                else void startRecording();
                              } else if (type === 'magic') {
                                setShowMagicLayout(true);
                              } else {
                                addWidget(
                                  type as WidgetType,
                                  getBuildingAwareOverrides(type as WidgetType)
                                );
                              }
                            }}
                            onRename={setRenamingFolderId}
                            onDelete={deleteFolder}
                            isEditMode={isEditMode}
                            onLongPress={handleLongPress}
                            minimizedWidgetsByType={minimizedWidgetsByType}
                            onRemoveItem={(folderId, type) =>
                              moveItemOutOfFolder(
                                folderId,
                                type,
                                dockItems.length
                              )
                            }
                            onReorder={reorderFolderItems}
                            globalStyle={globalStyle}
                          />
                        );
                      }
                    })}
                  </SortableContext>

                  {/* Drag Preview Overlay - Rendered in Portal to avoid offset bugs */}
                  {createPortal(
                    <DragOverlay
                      zIndex={Z_INDEX.modalContent}
                      dropAnimation={null}
                    >
                      {activeItemId ? (
                        <div className="flex flex-col items-center gap-1 scale-110 rotate-3 opacity-90 pointer-events-none">
                          {TOOLS.find((t) => t.type === activeItemId) ? (
                            <DockIcon
                              color={
                                TOOLS.find((t) => t.type === activeItemId)
                                  ?.color
                              }
                              className="flex items-center justify-center shadow-2xl ring-2 ring-white/50"
                            >
                              {React.createElement(
                                TOOLS.find((t) => t.type === activeItemId)
                                  ?.icon ?? Users,
                                { className: 'w-6 h-6' }
                              )}
                            </DockIcon>
                          ) : (
                            <DockIcon
                              color="bg-slate-200/80"
                              className="backdrop-blur-md shadow-2xl ring-2 ring-white/50 border border-white/20 grid grid-cols-2 gap-0.5 p-1.5"
                            >
                              <div className="w-3 h-3 bg-slate-400 rounded-sm" />
                              <div className="w-3 h-3 bg-slate-400 rounded-sm" />
                              <div className="w-3 h-3 bg-slate-400 rounded-sm" />
                              <div className="w-3 h-3 bg-slate-400 rounded-sm" />
                            </DockIcon>
                          )}
                        </div>
                      ) : null}
                    </DragOverlay>,
                    document.body
                  )}
                </DndContext>

                {/* Separator and Live Info Button */}
                {session?.isActive && (
                  <>
                    <div className="w-px h-8 bg-slate-200 mx-1 md:mx-2 flex-shrink-0" />

                    {/* LIVE INFO BUTTON (Visible when active) */}
                    <button
                      ref={liveButtonRef}
                      onClick={() => {
                        if (showLiveInfo) {
                          setShowLiveInfo(false);
                        } else if (liveButtonRef.current) {
                          const rect =
                            liveButtonRef.current.getBoundingClientRect();
                          setLivePopoverPos({
                            left: rect.left + rect.width / 2,
                            bottom: window.innerHeight - rect.top + 10,
                          });
                          setShowLiveInfo(true);
                        }
                      }}
                      aria-label={t('dock.viewLiveSession')}
                      className="group flex flex-col items-center gap-1 min-w-[50px] transition-transform active:scale-90 touch-none relative focus-visible:outline-none"
                    >
                      <DockIcon
                        color="bg-red-500"
                        className="flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-red-400 group-focus-visible:ring-offset-2 animate-pulse"
                      >
                        <Cast className="w-5 h-5 md:w-6 md:h-6" />
                      </DockIcon>
                      <DockLabel>{t('sidebar.header.live')}</DockLabel>
                    </button>

                    {/* LIVE POPOVER */}
                    {showLiveInfo &&
                      livePopoverPos &&
                      createPortal(
                        <GlassCard
                          globalStyle={globalStyle}
                          ref={livePopoverRef}
                          style={{
                            position: 'fixed',
                            left: livePopoverPos.left,
                            bottom: livePopoverPos.bottom,
                            transform: 'translateX(-50%)',
                            zIndex: Z_INDEX.popover,
                          }}
                          className="w-64 overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
                        >
                          {' '}
                          <div className="p-4 flex flex-col items-center gap-2 text-center">
                            <h3 className="text-xs font-black uppercase text-slate-600 tracking-wider">
                              {t('dock.liveSession')}
                            </h3>
                            <div className="text-3xl font-black text-indigo-700 font-mono tracking-widest my-1 drop-shadow-sm">
                              {session.code}
                            </div>
                            <div className="text-xxs text-slate-600 bg-white/50 px-2 py-1 rounded border border-white/30">
                              {getJoinUrl()}
                            </div>
                            <div className="text-xxs text-slate-500 mt-2">
                              {t('dock.provideCode')}
                            </div>
                          </div>
                          <div className="p-2 border-t border-white/30">
                            <button
                              onClick={() => setShowLiveInfo(false)}
                              className="w-full py-2 bg-white/50 hover:bg-white/60 text-slate-700 rounded-lg text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 focus-visible:ring-offset-white"
                            >
                              {t('common.close')}
                            </button>
                          </div>
                        </GlassCard>,
                        document.body
                      )}
                  </>
                )}

                {/* Separator and More Button */}
                <div className="w-px h-8 bg-slate-200 mx-1 md:mx-2 flex-shrink-0" />

                <button
                  ref={moreButtonRef}
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="group flex flex-col items-center gap-1 min-w-[50px] transition-transform active:scale-90 touch-none flex-shrink-0"
                  title={t('sidebar.header.moreWidgets')}
                >
                  <DockIcon
                    color="bg-brand-blue-primary shadow-lg shadow-brand-blue-primary/20"
                    className="flex items-center justify-center text-white group-hover:scale-110 group-hover:bg-brand-blue-dark transition-all"
                  >
                    <LayoutGrid className="w-5 h-5 md:w-6 md:h-6" />
                  </DockIcon>
                  <DockLabel className="text-slate-600 font-bold">
                    {t('sidebar.header.more')}
                  </DockLabel>
                </button>
              </>
            ) : (
              <div className="px-6 py-2 text-xxs font-black uppercase text-slate-400 italic">
                {t('dock.noAppsSelected')}
              </div>
            )}
          </GlassCard>

          {showMagicLayout && (
            <MagicLayoutModal onClose={() => setShowMagicLayout(false)} />
          )}
        </div>

        {/* Collapsed View (Floating Icon) */}
        <div
          className={`transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            !isExpanded
              ? 'scale-100 opacity-100 rotate-0'
              : 'scale-150 opacity-0 pointer-events-none absolute -rotate-180'
          }`}
        >
          {/* Compressed down to a single icon (plus quick access) */}
          <div className="flex items-center gap-4">
            {activeDashboard?.settings?.quickAccessWidgets?.[0] && (
              <QuickAccessButton
                type={activeDashboard.settings.quickAccessWidgets[0]}
                onClick={() => {
                  const type =
                    activeDashboard.settings?.quickAccessWidgets?.[0];
                  if (!type) return;

                  if (type === 'record') {
                    if (isRecording) void stopRecording();
                    else void startRecording();
                  } else if (type === 'magic') {
                    setShowMagicLayout(true);
                  } else {
                    addWidget(
                      type as WidgetType,
                      getBuildingAwareOverrides(type as WidgetType)
                    );
                  }
                }}
              />
            )}
            <button
              onClick={() => setIsExpanded(true)}
              className={`w-14 h-14 flex items-center justify-center bg-brand-blue-primary text-white active:scale-90 transition-all shadow-xl shadow-brand-blue-primary/40 ${
                globalStyle.dockBorderRadius === 'none'
                  ? 'rounded-none'
                  : globalStyle.dockBorderRadius === 'full'
                    ? 'rounded-full'
                    : `rounded-${globalStyle.dockBorderRadius}`
              }`}
              style={{
                backgroundColor: `rgba(45, 63, 137, ${globalStyle.dockTransparency + 0.4})`, // Slightly more opaque than expanded
              }}
              title={t('sidebar.header.openTools')}
            >
              <LayoutGrid className="w-6 h-6" />
            </button>
            {activeDashboard?.settings?.quickAccessWidgets?.[1] && (
              <QuickAccessButton
                type={activeDashboard.settings.quickAccessWidgets[1]}
                onClick={() => {
                  const type =
                    activeDashboard.settings?.quickAccessWidgets?.[1];
                  if (!type) return;

                  if (type === 'record') {
                    if (isRecording) void stopRecording();
                    else void startRecording();
                  } else if (type === 'magic') {
                    setShowMagicLayout(true);
                  } else {
                    addWidget(
                      type as WidgetType,
                      getBuildingAwareOverrides(type as WidgetType)
                    );
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

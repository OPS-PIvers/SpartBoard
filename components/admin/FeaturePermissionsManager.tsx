import React, { useState, useEffect, useCallback } from 'react';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import {
  FeaturePermission,
  AccessLevel,
  WidgetType,
  GradeLevel,
  InternalToolType,
  GlobalSticker,
} from '@/types';
import { useStorage } from '@/hooks/useStorage';
import { TOOLS } from '@/config/tools';
import {
  getWidgetGradeLevels,
  ALL_GRADE_LEVELS,
} from '@/config/widgetGradeLevels';
import {
  Shield,
  Users,
  Globe,
  Save,
  Settings,
  LayoutGrid,
  List,
} from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { Toast } from '@/components/common/Toast';

import { FeatureConfigurationPanel } from '@/components/admin/FeatureConfigurationPanel';
import { BetaUsersPanel } from '@/components/admin/BetaUsersPanel';
import { InstructionalRoutinesManager } from '@/components/admin/InstructionalRoutinesManager';
import { StickerLibraryModal } from '@/components/admin/StickerLibraryModal';
import { CalendarConfigurationModal } from '@/components/admin/CalendarConfigurationModal';
import { MiniAppLibraryModal } from '@/components/admin/MiniAppLibraryModal';
import { StickerGlobalConfig } from '@/types';

export const FeaturePermissionsManager: React.FC = () => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [permissions, setPermissions] = useState<
    Map<WidgetType | InternalToolType, FeaturePermission>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<WidgetType | InternalToolType>>(
    new Set()
  );
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState<
    Set<WidgetType | InternalToolType>
  >(new Set());
  const [editingConfig, setEditingConfig] = useState<
    WidgetType | InternalToolType | null
  >(null);
  const [isRoutinesLibraryOpen, setIsRoutinesLibraryOpen] = useState(false);
  const [isStickerLibraryOpen, setIsStickerLibraryOpen] = useState(false);
  const [isCalendarConfigOpen, setIsCalendarConfigOpen] = useState(false);
  const [isMiniAppLibraryOpen, setIsMiniAppLibraryOpen] = useState(false);
  const [isSavingStickers, setIsSavingStickers] = useState(false);
  const { uploadWeatherImage } = useStorage();

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    const timeoutId = setTimeout(() => setMessage(null), 3000);
    // Return cleanup function
    return () => clearTimeout(timeoutId);
  }, []);

  const getGlobalStickers = (): (string | GlobalSticker)[] => {
    const config = getPermission('stickers').config as
      | StickerGlobalConfig
      | undefined;
    return config?.globalStickers ?? [];
  };

  const handleStickerLibraryChange = (
    newStickers: (string | GlobalSticker)[]
  ) => {
    const current = getPermission('stickers');
    const updatedConfig: StickerGlobalConfig = {
      ...(current.config as StickerGlobalConfig | undefined),
      globalStickers: newStickers,
    };
    updatePermission('stickers', {
      config: updatedConfig as unknown as Record<string, unknown>,
    });
  };

  const handleStickerLibraryDiscard = (
    originalStickers: (string | GlobalSticker)[]
  ) => {
    const current = getPermission('stickers');
    const revertedConfig: StickerGlobalConfig = {
      ...(current.config as StickerGlobalConfig | undefined),
      globalStickers: originalStickers,
    };
    // Revert permission state and clear unsaved flag — no round-trip through
    // updatePermission so we don't re-add 'stickers' to unsavedChanges.
    setPermissions((prev) =>
      new Map(prev).set('stickers', {
        ...current,
        config: revertedConfig as unknown as Record<string, unknown>,
      })
    );
    setUnsavedChanges((prev) => {
      const next = new Set(prev);
      next.delete('stickers');
      return next;
    });
  };

  const handleStickerLibrarySave = async () => {
    setIsSavingStickers(true);
    try {
      await savePermission('stickers');
    } finally {
      setIsSavingStickers(false);
    }
  };

  const loadPermissions = useCallback(async () => {
    if (isAuthBypass) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'feature_permissions'));
      const permMap = new Map<
        WidgetType | InternalToolType,
        FeaturePermission
      >();

      snapshot.forEach((doc) => {
        const data = doc.data() as FeaturePermission;
        // Migration fix: If fetched permission still has "universal", clean it up
        if (
          data.gradeLevels &&
          data.gradeLevels.includes('universal' as GradeLevel)
        ) {
          data.gradeLevels = ALL_GRADE_LEVELS;
        }
        permMap.set(data.widgetType, data);
      });

      setPermissions(permMap);
    } catch (error) {
      console.error('Error loading permissions:', error);
      showMessage('error', 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  // Load permissions from Firestore
  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  const getPermission = (
    widgetType: WidgetType | InternalToolType
  ): FeaturePermission => {
    return (
      permissions.get(widgetType) ?? {
        widgetType,
        accessLevel: 'public',
        betaUsers: [],
        enabled: true,
      }
    );
  };

  const updatePermission = (
    widgetType: WidgetType | InternalToolType,
    updates: Partial<FeaturePermission>
  ) => {
    const current = getPermission(widgetType);
    const updated = { ...current, ...updates };
    setPermissions(new Map(permissions).set(widgetType, updated));
    // Mark as having unsaved changes
    setUnsavedChanges(new Set(unsavedChanges).add(widgetType));
  };

  const savePermission = async (widgetType: WidgetType | InternalToolType) => {
    try {
      setSaving(new Set(saving).add(widgetType));
      const permission = getPermission(widgetType);

      await setDoc(doc(db, 'feature_permissions', widgetType), permission);

      // Clear unsaved changes flag for this widget
      setUnsavedChanges((prev) => {
        const next = new Set(prev);
        next.delete(widgetType);
        return next;
      });

      showMessage('success', `Saved ${widgetType} permissions`);
    } catch (error) {
      console.error('Error saving permission:', error);
      showMessage('error', `Failed to save ${widgetType} permissions`);
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(widgetType);
        return next;
      });
    }
  };

  const toggleGradeLevel = (
    widgetType: WidgetType | InternalToolType,
    level: GradeLevel
  ) => {
    const permission = getPermission(widgetType);
    const currentLevels =
      permission.gradeLevels ?? getWidgetGradeLevels(widgetType);

    let newLevels: GradeLevel[];

    if (currentLevels.includes(level)) {
      newLevels = currentLevels.filter((l) => l !== level);
    } else {
      newLevels = [...currentLevels, level];
    }

    // NOTE: If newLevels is empty, the widget will be hidden from all specific grade filters
    // but will still be visible when the 'All' filter is selected.
    updatePermission(widgetType, { gradeLevels: newLevels });
  };

  const toggleAllGradeLevels = (widgetType: WidgetType | InternalToolType) => {
    const permission = getPermission(widgetType);
    const currentLevels =
      permission.gradeLevels ?? getWidgetGradeLevels(widgetType);

    const allSelected = ALL_GRADE_LEVELS.every((l) =>
      currentLevels.includes(l)
    );

    updatePermission(widgetType, {
      gradeLevels: allSelected ? [] : [...ALL_GRADE_LEVELS],
    });
  };

  const getAccessLevelIcon = (level: AccessLevel) => {
    switch (level) {
      case 'admin':
        return <Shield className="w-4 h-4" />;
      case 'beta':
        return <Users className="w-4 h-4" />;
      case 'public':
        return <Globe className="w-4 h-4" />;
    }
  };

  const getAccessLevelColor = (level: AccessLevel) => {
    switch (level) {
      case 'admin':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'beta':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'public':
        return 'bg-green-100 text-green-700 border-green-300';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading permissions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Message Toast */}
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}

      {/* Header with View Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-700">
          Feature Permissions
        </h2>
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-all ${
              viewMode === 'grid'
                ? 'bg-white text-brand-blue-primary shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
            title="Grid View"
          >
            <LayoutGrid size={20} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-all ${
              viewMode === 'list'
                ? 'bg-white text-brand-blue-primary shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
            title="List View"
          >
            <List size={20} />
          </button>
        </div>
      </div>

      {/* Widget Permission Cards */}
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
            : 'space-y-3'
        }
      >
        {TOOLS.map((tool) => {
          const permission = getPermission(tool.type);
          const isSaving = saving.has(tool.type);

          const currentLevels =
            permission.gradeLevels ?? getWidgetGradeLevels(tool.type);
          const isAllSelected = ALL_GRADE_LEVELS.every((l) =>
            currentLevels.includes(l)
          );

          if (viewMode === 'list') {
            return (
              <div
                key={tool.type}
                className="bg-white border-2 border-slate-200 rounded-xl hover:border-brand-blue-light transition-colors overflow-hidden"
              >
                {/* Top Bar */}
                <div className="flex items-center gap-4 p-3">
                  {/* Identity Section: Icon + Name Input */}
                  <div className="flex items-center gap-3 w-64 shrink-0">
                    <div
                      className={`${tool.color} p-2 rounded-lg text-white shrink-0`}
                    >
                      <tool.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={permission.displayName ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          updatePermission(tool.type, {
                            displayName: val || undefined,
                          });
                        }}
                        className="w-full font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-brand-blue-primary focus:outline-none px-0 py-0.5 transition-colors"
                        placeholder={tool.label}
                      />
                      <p className="text-xs text-slate-500">{tool.type}</p>
                    </div>
                  </div>

                  <div className="w-px h-8 bg-slate-100 mx-2" />

                  {/* Enabled Toggle */}
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xxs font-bold text-slate-400 uppercase">
                      Enabled
                    </span>
                    <Toggle
                      checked={permission.enabled}
                      onChange={(checked) =>
                        updatePermission(tool.type, {
                          enabled: checked,
                        })
                      }
                      size="sm"
                    />
                  </div>

                  {/* Access Level Controls */}
                  <div className="flex items-center gap-1 ml-4">
                    {(['admin', 'beta', 'public'] as AccessLevel[]).map(
                      (level) => (
                        <button
                          key={level}
                          onClick={() =>
                            updatePermission(tool.type, { accessLevel: level })
                          }
                          className={`px-2 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1 transition-all ${
                            permission.accessLevel === level
                              ? getAccessLevelColor(level)
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {getAccessLevelIcon(level)}
                          <span className="capitalize">{level}</span>
                        </button>
                      )
                    )}
                  </div>

                  {/* Grade Level Controls */}
                  <div className="flex items-center gap-1 ml-4 flex-1 flex-wrap justify-end">
                    {ALL_GRADE_LEVELS.map((level) => {
                      const isSelected = currentLevels.includes(level);
                      return (
                        <button
                          key={level}
                          onClick={() => toggleGradeLevel(tool.type, level)}
                          className={`px-2 py-1 rounded-md text-xxs font-bold border transition-all ${
                            isSelected
                              ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {level.toUpperCase()}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => toggleAllGradeLevels(tool.type)}
                      className={`px-2 py-1 rounded-md text-xxs font-bold border transition-all ${
                        isAllSelected
                          ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      ALL
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-100">
                    <button
                      onClick={() => {
                        if (tool.type === 'instructionalRoutines') {
                          setIsRoutinesLibraryOpen(true);
                        } else if (tool.type === 'stickers') {
                          setIsStickerLibraryOpen(true);
                        } else if (tool.type === 'calendar') {
                          setIsCalendarConfigOpen(true);
                        } else if (tool.type === 'miniApp') {
                          setIsMiniAppLibraryOpen(true);
                        } else {
                          setEditingConfig(
                            editingConfig === tool.type ? null : tool.type
                          );
                        }
                      }}
                      className={`p-2 rounded-lg transition-colors ${
                        (tool.type === 'instructionalRoutines' &&
                          isRoutinesLibraryOpen) ||
                        (tool.type === 'stickers' && isStickerLibraryOpen) ||
                        (tool.type === 'calendar' && isCalendarConfigOpen) ||
                        (tool.type === 'miniApp' && isMiniAppLibraryOpen) ||
                        editingConfig === tool.type
                          ? 'bg-brand-blue-primary text-white'
                          : 'text-slate-400 hover:bg-slate-100'
                      }`}
                      title="Edit widget configuration"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => savePermission(tool.type)}
                      disabled={isSaving}
                      className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        unsavedChanges.has(tool.type)
                          ? 'bg-orange-600 hover:bg-orange-700 text-white'
                          : 'text-slate-400 hover:bg-brand-blue-primary hover:text-white'
                      }`}
                      title={
                        unsavedChanges.has(tool.type)
                          ? 'Save Changes'
                          : 'Save Permissions'
                      }
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Content Wrapper */}
                {(editingConfig === tool.type ||
                  permission.accessLevel === 'beta') && (
                  <div className="border-t border-slate-100 bg-slate-50">
                    {/* Settings Panel */}
                    {editingConfig === tool.type && (
                      <FeatureConfigurationPanel
                        tool={tool}
                        permission={permission}
                        updatePermission={updatePermission}
                        showMessage={showMessage}
                        uploadWeatherImage={uploadWeatherImage}
                      />
                    )}

                    {/* Beta Users Panel */}
                    {permission.accessLevel === 'beta' && (
                      <BetaUsersPanel
                        tool={tool}
                        permission={permission}
                        updatePermission={updatePermission}
                        showMessage={showMessage}
                        variant="expanded"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div
              key={tool.type}
              className="bg-white border-2 border-slate-200 rounded-xl p-4 hover:border-brand-blue-light transition-colors"
            >
              {/* Widget Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`${tool.color} p-2 rounded-lg text-white`}>
                    <tool.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={permission.displayName ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updatePermission(tool.type, {
                          displayName: val || undefined,
                        });
                      }}
                      className="w-full font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-brand-blue-primary focus:outline-none px-0 py-0.5 transition-colors"
                      placeholder={tool.label}
                    />
                    <p className="text-xs text-slate-500">{tool.type}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (tool.type === 'instructionalRoutines') {
                        setIsRoutinesLibraryOpen(true);
                      } else if (tool.type === 'stickers') {
                        setIsStickerLibraryOpen(true);
                      } else if (tool.type === 'calendar') {
                        setIsCalendarConfigOpen(true);
                      } else if (tool.type === 'miniApp') {
                        setIsMiniAppLibraryOpen(true);
                      } else {
                        setEditingConfig(
                          editingConfig === tool.type ? null : tool.type
                        );
                      }
                    }}
                    className={`p-2 rounded-lg transition-colors ${
                      (tool.type === 'instructionalRoutines' &&
                        isRoutinesLibraryOpen) ||
                      (tool.type === 'stickers' && isStickerLibraryOpen) ||
                      (tool.type === 'calendar' && isCalendarConfigOpen) ||
                      (tool.type === 'miniApp' && isMiniAppLibraryOpen) ||
                      editingConfig === tool.type
                        ? 'bg-brand-blue-primary text-white'
                        : 'text-slate-400 hover:bg-slate-100'
                    }`}
                    title="Edit widget configuration"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Configuration Panel */}
              {editingConfig === tool.type && (
                <FeatureConfigurationPanel
                  tool={tool}
                  permission={permission}
                  updatePermission={updatePermission}
                  showMessage={showMessage}
                  uploadWeatherImage={uploadWeatherImage}
                />
              )}

              {/* Enabled Toggle */}
              <div className="flex items-center justify-between mb-3 p-3 bg-slate-50 rounded-lg">
                <span className="text-sm font-medium text-slate-700">
                  Feature Enabled
                </span>
                <Toggle
                  checked={permission.enabled}
                  onChange={(checked) =>
                    updatePermission(tool.type, {
                      enabled: checked,
                    })
                  }
                  size="md"
                />
              </div>

              {/* Access Level */}
              <div className="mb-3">
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Access Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['admin', 'beta', 'public'] as AccessLevel[]).map(
                    (level) => (
                      <button
                        key={level}
                        onClick={() =>
                          updatePermission(tool.type, { accessLevel: level })
                        }
                        className={`px-3 py-2 rounded-lg border-2 text-sm font-medium flex items-center justify-center gap-1 transition-all ${
                          permission.accessLevel === level
                            ? getAccessLevelColor(level)
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {getAccessLevelIcon(level)}
                        <span className="capitalize">{level}</span>
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Grade Levels */}
              <div className="mb-3">
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Grade Levels
                </label>
                <div className="grid grid-cols-5 gap-1">
                  {ALL_GRADE_LEVELS.map((level) => {
                    const isSelected = currentLevels.includes(level);

                    return (
                      <button
                        key={level}
                        onClick={() => toggleGradeLevel(tool.type, level)}
                        className={`py-1.5 rounded-md text-xxs font-bold border transition-all ${
                          isSelected
                            ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {level.toUpperCase()}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => toggleAllGradeLevels(tool.type)}
                    className={`py-1.5 rounded-md text-xxs font-bold border transition-all ${
                      isAllSelected
                        ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    ALL
                  </button>
                </div>
              </div>

              {/* Beta Users (only show if access level is beta) */}
              {permission.accessLevel === 'beta' && (
                <BetaUsersPanel
                  tool={tool}
                  permission={permission}
                  updatePermission={updatePermission}
                  showMessage={showMessage}
                  variant="card"
                />
              )}

              {/* Save Button */}
              <button
                onClick={() => savePermission(tool.type)}
                disabled={isSaving}
                className={`w-full px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  unsavedChanges.has(tool.type)
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-brand-blue-primary hover:bg-brand-blue-dark text-white'
                }`}
              >
                <Save className="w-4 h-4" />
                {isSaving
                  ? 'Saving...'
                  : unsavedChanges.has(tool.type)
                    ? 'Save Changes'
                    : 'Save Permissions'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Instructional Routines Library Modal */}
      {isRoutinesLibraryOpen && (
        <InstructionalRoutinesManager
          onClose={() => setIsRoutinesLibraryOpen(false)}
        />
      )}

      {/* Global Sticker Library Modal */}
      {isStickerLibraryOpen && (
        <StickerLibraryModal
          stickers={getGlobalStickers()}
          onClose={() => setIsStickerLibraryOpen(false)}
          onDiscard={handleStickerLibraryDiscard}
          onStickersChange={handleStickerLibraryChange}
          onSave={handleStickerLibrarySave}
          isSaving={isSavingStickers}
          hasUnsavedChanges={unsavedChanges.has('stickers')}
        />
      )}

      {/* Calendar Configuration Modal */}
      {isCalendarConfigOpen && (
        <CalendarConfigurationModal
          isOpen={isCalendarConfigOpen}
          onClose={() => setIsCalendarConfigOpen(false)}
        />
      )}

      {/* Mini App Global Library Modal */}
      {isMiniAppLibraryOpen && (
        <MiniAppLibraryModal onClose={() => setIsMiniAppLibraryOpen(false)} />
      )}
    </div>
  );
};

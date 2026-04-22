import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, doc, setDoc, getDocs, getDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import {
  FeaturePermission,
  AccessLevel,
  WidgetType,
  GradeLevel,
  InternalToolType,
  GlobalSticker,
  ToolMetadata,
} from '@/types';
import { useStorage } from '@/hooks/useStorage';
import { TOOLS } from '@/config/tools';
import {
  getWidgetGradeLevels,
  ALL_GRADE_LEVELS,
} from '@/config/widgetGradeLevels';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import {
  Shield,
  Users,
  Globe,
  Save,
  Settings,
  LayoutGrid,
  List,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Toggle } from '@/components/common/Toggle';
import { Toast } from '@/components/common/Toast';

import { GenericConfigurationModal } from '@/components/admin/GenericConfigurationModal';
import { BetaUsersPanel } from '@/components/admin/BetaUsersPanel';
import { InstructionalRoutinesManager } from '@/components/admin/InstructionalRoutinesManager';
import { StickerLibraryModal } from '@/components/admin/StickerLibraryModal';
import { CalendarConfigurationModal } from '@/components/admin/CalendarConfigurationModal';
import { SpecialistScheduleConfigurationModal } from '@/components/admin/SpecialistScheduleConfigurationModal';
import { GraphicOrganizerConfigurationModal } from '@/components/admin/GraphicOrganizerConfigurationModal';
import { MiniAppLibraryModal } from '@/components/admin/MiniAppLibraryModal';
import { StarterPackConfigurationModal } from '@/components/admin/StarterPackConfigurationModal';
import { MusicLibraryModal } from '@/components/admin/MusicLibraryModal';
import { CatalystConfigurationModal } from '@/components/admin/CatalystConfigurationModal';
import { PdfLibraryModal } from '@/components/admin/PdfLibraryModal';
import { VideoActivityConfigurationModal } from '@/components/admin/VideoActivityConfigurationModal';
import { WorkSymbolsConfigurationModal } from '@/components/admin/WorkSymbolsConfigurationModal';
import { BloomsTaxonomyConfigurationModal } from '@/components/admin/BloomsTaxonomyConfigurationModal';
import { StickerGlobalConfig } from '@/types';
import { useDialog } from '@/context/useDialog';

export const FeaturePermissionsManager: React.FC = () => {
  const { showConfirm } = useDialog();
  const isMobile = useIsMobile();
  const buildings = useAdminBuildings();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const effectiveViewMode = isMobile ? 'grid' : viewMode;
  const [showFilters, setShowFilters] = useState(false);
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
  const [activeModalTool, setActiveModalTool] = useState<ToolMetadata | null>(
    null
  );
  const [isSavingStickers, setIsSavingStickers] = useState(false);
  const { uploadWeatherImage } = useStorage();

  // Filter state
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'on' | 'off'>(
    'all'
  );
  const [filterAvailability, setFilterAvailability] = useState<
    'all' | AccessLevel
  >('all');
  const [filterBuilding, setFilterBuilding] = useState<string>('all');

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

  const savePermission = async (
    widgetType: WidgetType | InternalToolType
  ): Promise<boolean> => {
    try {
      setSaving((prev) => new Set(prev).add(widgetType));
      const permission = getPermission(widgetType);

      await setDoc(doc(db, 'feature_permissions', widgetType), permission);

      // Clear unsaved changes flag for this widget
      setUnsavedChanges((prev) => {
        const next = new Set(prev);
        next.delete(widgetType);
        return next;
      });

      showMessage('success', `Saved ${widgetType} permissions`);
      return true;
    } catch (error) {
      console.error('Error saving permission:', error);
      showMessage('error', `Failed to save ${widgetType} permissions`);
      return false;
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

    // If deselecting the last level would leave an empty array, fall back to the
    // widget's configured default instead. An empty override is read as "no
    // override" by matchesUserBuilding, so writing [] here would silently reset
    // to the default anyway — writing the default explicitly keeps the UI state
    // consistent with the persisted state and mirrors toggleAllGradeLevels.
    updatePermission(widgetType, {
      gradeLevels:
        newLevels.length > 0
          ? newLevels
          : [...getWidgetGradeLevels(widgetType)],
    });
  };

  const toggleAllGradeLevels = (widgetType: WidgetType | InternalToolType) => {
    const permission = getPermission(widgetType);
    const currentLevels =
      permission.gradeLevels ?? getWidgetGradeLevels(widgetType);

    const allSelected = ALL_GRADE_LEVELS.every((l) =>
      currentLevels.includes(l)
    );

    // When toggling "ALL" off, reset to the widget's configured default
    // rather than writing an empty array. An empty override is ambiguous and
    // the Dock filter would hide the widget from every user whose buildings
    // resolve to a non-empty grade set.
    updatePermission(widgetType, {
      gradeLevels: allSelected
        ? [...getWidgetGradeLevels(widgetType)]
        : [...ALL_GRADE_LEVELS],
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

  const filteredTools = useMemo(() => {
    const sorted = [...TOOLS].sort((a, b) => a.label.localeCompare(b.label));
    return sorted.filter((tool) => {
      const perm = permissions.get(tool.type) ?? {
        widgetType: tool.type,
        accessLevel: 'public' as AccessLevel,
        betaUsers: [] as string[],
        enabled: true,
      };
      if (filterEnabled === 'on' && !perm.enabled) return false;
      if (filterEnabled === 'off' && perm.enabled) return false;
      if (
        filterAvailability !== 'all' &&
        perm.accessLevel !== filterAvailability
      )
        return false;
      if (filterBuilding !== 'all') {
        const building = buildings.find((b) => b.id === filterBuilding);
        if (building) {
          const currentLevels =
            perm.gradeLevels ?? getWidgetGradeLevels(tool.type);
          if (!building.gradeLevels.some((gl) => currentLevels.includes(gl)))
            return false;
        }
      }
      return true;
    });
  }, [
    permissions,
    filterEnabled,
    filterAvailability,
    filterBuilding,
    buildings,
  ]);

  const btnClass = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
      active
        ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
    }`;

  const renderEnabledFilter = () => (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-xs text-slate-500 font-medium">Enabled:</span>
      {(['all', 'on', 'off'] as const).map((val) => (
        <button
          key={val}
          onClick={() => setFilterEnabled(val)}
          className={btnClass(filterEnabled === val)}
        >
          {val === 'all' ? 'All' : val === 'on' ? 'On' : 'Off'}
        </button>
      ))}
    </div>
  );

  const renderAvailabilityFilter = () => (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-xs text-slate-500 font-medium">Availability:</span>
      {(['all', 'admin', 'beta', 'public'] as const).map((val) => (
        <button
          key={val}
          onClick={() => setFilterAvailability(val)}
          className={btnClass(filterAvailability === val)}
        >
          {val === 'all' ? 'All' : val.charAt(0).toUpperCase() + val.slice(1)}
        </button>
      ))}
    </div>
  );

  const renderBuildingFilter = () => (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-xs text-slate-500 font-medium">Building:</span>
      <button
        onClick={() => setFilterBuilding('all')}
        className={btnClass(filterBuilding === 'all')}
      >
        All
      </button>
      {buildings.map((b) => (
        <button
          key={b.id}
          onClick={() => setFilterBuilding(b.id)}
          className={btnClass(filterBuilding === b.id)}
          title={b.name}
        >
          {b.gradeLabel}
        </button>
      ))}
    </div>
  );

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

      {/* Filters */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl mb-2">
        {/* Filter header row */}
        <div className="flex items-center gap-2 p-2 md:p-3">
          {/* Mobile: collapsible filter toggle */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 text-slate-500 md:hidden"
            aria-expanded={showFilters}
            aria-controls="feature-perm-mobile-filters"
          >
            <Filter className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">
              Filters
            </span>
            <ChevronDown
              className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Desktop: inline filters */}
          <div className="hidden md:flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Filter className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wide">
                Filter
              </span>
            </div>
            {renderEnabledFilter()}
            <div className="w-px h-5 bg-slate-200" />
            {renderAvailabilityFilter()}
            <div className="w-px h-5 bg-slate-200" />
            {renderBuildingFilter()}
          </div>

          {/* View Mode Toggle - hidden on mobile */}
          <div className="ml-auto hidden md:flex bg-white p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'grid'
                  ? 'bg-slate-100 text-brand-blue-primary shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Grid View"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'list'
                  ? 'bg-slate-100 text-brand-blue-primary shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title="List View"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {/* Mobile: collapsible filter content */}
        {showFilters && (
          <div
            id="feature-perm-mobile-filters"
            className="flex flex-col gap-3 px-3 pb-3 border-t border-slate-200 pt-3 md:hidden"
          >
            {renderEnabledFilter()}
            {renderAvailabilityFilter()}
            {renderBuildingFilter()}
          </div>
        )}
      </div>

      {/* Widget Permission Cards */}
      <>
        {filteredTools.length === 0 && (
          <div className="py-12 text-center text-slate-400">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="font-medium">No widgets match the current filters.</p>
          </div>
        )}
        <div
          className={
            effectiveViewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'space-y-3'
          }
        >
          {filteredTools.map((tool) => {
            const permission = getPermission(tool.type);
            const isSaving = saving.has(tool.type);

            const currentLevels =
              permission.gradeLevels ?? getWidgetGradeLevels(tool.type);
            const isAllSelected = ALL_GRADE_LEVELS.every((l) =>
              currentLevels.includes(l)
            );

            if (effectiveViewMode === 'list') {
              return (
                <div
                  key={tool.type}
                  className="bg-white border-2 border-slate-200 rounded-xl hover:border-brand-blue-light transition-colors overflow-hidden"
                >
                  {/* Top Bar */}
                  <div className="flex items-center gap-4 p-3">
                    {/* Identity Section: Icon + Name Input */}
                    <div className="flex items-center gap-3 w-56 xl:w-64 shrink-0">
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
                              updatePermission(tool.type, {
                                accessLevel: level,
                              })
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
                        onClick={() => setActiveModalTool(tool)}
                        className={`p-2 rounded-lg transition-colors ${
                          activeModalTool?.type === tool.type
                            ? 'bg-brand-blue-primary text-white'
                            : 'text-slate-400 hover:bg-slate-100'
                        }`}
                        title="Edit widget configuration"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => savePermission(tool.type)}
                        disabled={isSaving || !unsavedChanges.has(tool.type)}
                        className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          unsavedChanges.has(tool.type)
                            ? 'bg-orange-600 hover:bg-orange-700 text-white'
                            : 'text-slate-300 hover:bg-brand-blue-primary hover:text-white'
                        }`}
                        title={
                          unsavedChanges.has(tool.type)
                            ? 'Save Changes'
                            : 'No changes to save'
                        }
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content Wrapper */}
                  {permission.accessLevel === 'beta' && (
                    <div className="border-t border-slate-100 bg-slate-50">
                      {/* Beta Users Panel */}
                      <BetaUsersPanel
                        tool={tool}
                        permission={permission}
                        updatePermission={updatePermission}
                        showMessage={showMessage}
                        variant="expanded"
                      />
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
                      onClick={() => setActiveModalTool(tool)}
                      className={`p-2 rounded-lg transition-colors ${
                        activeModalTool?.type === tool.type
                          ? 'bg-brand-blue-primary text-white'
                          : 'text-slate-400 hover:bg-slate-100'
                      }`}
                      title="Edit widget configuration"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </div>

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
                            updatePermission(tool.type, {
                              accessLevel: level,
                            })
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
                  disabled={isSaving || !unsavedChanges.has(tool.type)}
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
      </>

      {/* Widget Configuration Modals */}
      {activeModalTool?.type === 'instructionalRoutines' && (
        <InstructionalRoutinesManager
          onClose={() => setActiveModalTool(null)}
        />
      )}

      {activeModalTool?.type === 'stickers' && (
        <StickerLibraryModal
          stickers={getGlobalStickers()}
          onClose={() => setActiveModalTool(null)}
          onDiscard={handleStickerLibraryDiscard}
          onStickersChange={handleStickerLibraryChange}
          onSave={handleStickerLibrarySave}
          isSaving={isSavingStickers}
          hasUnsavedChanges={unsavedChanges.has('stickers')}
        />
      )}

      {activeModalTool?.type === 'calendar' && (
        <CalendarConfigurationModal
          isOpen={true}
          onClose={() => setActiveModalTool(null)}
        />
      )}

      {activeModalTool?.type === 'specialist-schedule' && (
        <SpecialistScheduleConfigurationModal
          isOpen={true}
          onClose={() => setActiveModalTool(null)}
        />
      )}

      {activeModalTool?.type === 'graphic-organizer' && (
        <GraphicOrganizerConfigurationModal
          isOpen={true}
          onClose={() => setActiveModalTool(null)}
          permission={getPermission('graphic-organizer')}
          onSave={(updates) => updatePermission('graphic-organizer', updates)}
        />
      )}

      {activeModalTool?.type === 'miniApp' && (
        <MiniAppLibraryModal onClose={() => setActiveModalTool(null)} />
      )}

      {activeModalTool?.type === 'starter-pack' && (
        <StarterPackConfigurationModal
          isOpen={true}
          onClose={() => setActiveModalTool(null)}
          permission={getPermission('starter-pack')}
          onSave={(updates) => updatePermission('starter-pack', updates)}
        />
      )}

      {activeModalTool?.type === 'music' && (
        <MusicLibraryModal onClose={() => setActiveModalTool(null)} />
      )}

      {activeModalTool?.type === 'catalyst' && (
        <CatalystConfigurationModal
          isOpen={true}
          onClose={() => setActiveModalTool(null)}
          permission={getPermission('catalyst')}
          onSave={(updates) => updatePermission('catalyst', updates)}
        />
      )}

      {activeModalTool?.type === 'pdf' && (
        <PdfLibraryModal onClose={() => setActiveModalTool(null)} />
      )}

      {activeModalTool?.type === 'video-activity' && (
        <VideoActivityConfigurationModal
          onClose={() => setActiveModalTool(null)}
          permission={getPermission('video-activity')}
          onSave={(updates) => updatePermission('video-activity', updates)}
        />
      )}

      {activeModalTool?.type === 'work-symbols' && (
        <WorkSymbolsConfigurationModal
          isOpen={true}
          onClose={() => setActiveModalTool(null)}
          permission={getPermission('work-symbols')}
          onSave={(updates) => updatePermission('work-symbols', updates)}
        />
      )}

      {activeModalTool?.type === 'blooms-taxonomy' && (
        <BloomsTaxonomyConfigurationModal
          isOpen={true}
          onClose={() => setActiveModalTool(null)}
          permission={getPermission('blooms-taxonomy')}
          onSave={(updates) => updatePermission('blooms-taxonomy', updates)}
        />
      )}

      {activeModalTool &&
        ![
          'blooms-taxonomy',
          'calendar',
          'catalyst',
          'graphic-organizer',
          'instructionalRoutines',
          'miniApp',
          'music',
          'pdf',
          'specialist-schedule',
          'starter-pack',
          'stickers',
          'video-activity',
          'work-symbols',
        ].includes(activeModalTool.type) && (
          <GenericConfigurationModal
            tool={activeModalTool}
            permission={getPermission(activeModalTool.type)}
            onClose={async () => {
              const toolType = activeModalTool?.type;
              if (toolType && unsavedChanges.has(toolType)) {
                const confirmed = await showConfirm(
                  'You have unsaved changes. Are you sure you want to discard them?',
                  {
                    title: 'Discard Changes',
                    variant: 'warning',
                    confirmLabel: 'Discard',
                  }
                );
                if (confirmed) {
                  setUnsavedChanges((prev) => {
                    const next = new Set(prev);
                    next.delete(toolType);
                    return next;
                  });

                  if (!isAuthBypass) {
                    try {
                      const docRef = doc(db, 'feature_permissions', toolType);
                      const snap = await getDoc(docRef);
                      let data: FeaturePermission;
                      if (snap.exists()) {
                        data = snap.data() as FeaturePermission;
                        if (
                          data.gradeLevels &&
                          data.gradeLevels.includes('universal' as GradeLevel)
                        ) {
                          data.gradeLevels = ALL_GRADE_LEVELS;
                        }
                      } else {
                        data = {
                          widgetType: toolType,
                          accessLevel: 'public',
                          betaUsers: [],
                          enabled: true,
                        };
                      }
                      setPermissions((prev) =>
                        new Map(prev).set(toolType, data)
                      );
                    } catch (err) {
                      console.error('Failed to revert permission', err);
                    } finally {
                      setActiveModalTool(null);
                    }
                  } else {
                    setActiveModalTool(null);
                  }
                }
              } else {
                setActiveModalTool(null);
              }
            }}
            onSave={async () => {
              const success = await savePermission(activeModalTool.type);
              if (success) {
                setActiveModalTool(null);
              }
            }}
            isSaving={saving.has(activeModalTool.type)}
            hasUnsavedChanges={unsavedChanges.has(activeModalTool.type)}
            updatePermission={updatePermission}
            showMessage={showMessage}
            uploadWeatherImage={uploadWeatherImage}
          />
        )}
    </div>
  );
};

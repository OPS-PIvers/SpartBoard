import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  AccessLevel,
  AssignmentMode,
  AssignmentWidgetKey,
  GlobalFeature,
  GlobalFeaturePermission,
} from '@/types';
import { parseAssignmentModesConfig } from '@/utils/assignmentModesConfig';
import {
  Shield,
  Users,
  Globe,
  Save,
  ClipboardCheck,
  LayoutGrid,
  List,
  Filter,
  ChevronDown,
  BookOpen,
  Boxes,
  Send,
  Eye,
  ListChecks,
  PlayCircle,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useStorage } from '@/hooks/useStorage';
import { useIsMobile } from '@/hooks/useIsMobile';
import { logError } from '@/utils/logError';
import { Toggle } from '@/components/common/Toggle';
import { Toast } from '@/components/common/Toast';
import { PermissionBuildingMultiSelect } from '@/components/admin/PermissionBuildingMultiSelect';
import { MinTierSelect } from '@/components/admin/MinTierSelect';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { BetaUsersPanel } from '@/components/admin/BetaUsersPanel';
import { useAccessSearch } from '@/components/admin/access/accessSearchContext';
import {
  AccessSearchEmpty,
  AdminSearchField,
} from '@/components/admin/access/AdminSearchField';
import {
  GLOBAL_SETTINGS_FEATURES,
  featureSearchFields,
  matchesSearch,
} from '@/components/admin/access/accessSearch';
import { GEMINI_FEATURES } from '@/components/admin/access/useGlobalPermissionsEditor';
import { isDeprecatedGeminiModelId } from '@/utils/geminiModelDeprecation';

/**
 * Widgets surfaced in the Assignment Modes admin section. All four widgets
 * with student-facing assignment flows are listed; flipping any of them to
 * View only swaps the teacher Assign button to Share, hides the In Progress
 * tab in favor of Shared, blocks submissions, and starts logging URL views.
 */
const ASSIGNMENT_WIDGETS: {
  key: AssignmentWidgetKey;
  label: string;
  Icon: React.ElementType;
}[] = [
  {
    key: 'quiz',
    label: 'Quiz',
    Icon: ListChecks,
  },
  {
    key: 'videoActivity',
    label: 'Video Activity',
    Icon: PlayCircle,
  },
  {
    key: 'miniApp',
    label: 'Mini Apps',
    Icon: Boxes,
  },
  {
    key: 'guidedLearning',
    label: 'Guided Learning',
    Icon: BookOpen,
  },
];

// Keep in sync with DEFAULT_ADVANCED_MODEL / DEFAULT_STANDARD_MODEL in aiGeneration.ts — this picker writes to global_permissions/gemini-functions.
export const KNOWN_GEMINI_MODELS = [
  {
    value: 'gemini-3.7-flash',
    label: 'Gemini 3.7 Flash',
    tier: 'advanced',
  },
  {
    value: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash Lite',
    tier: 'standard',
  },
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    tier: 'advanced',
  },
  {
    value: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    tier: 'standard',
  },
  // gemini-2.0-*/1.5-* dropped: GEMINI.md marks them deprecated and normalizeModelName rejects them server-side. 2.5-* kept — Google's Vertex locations doc lists both as global-endpoint models.
] as const;

const GEMINI_MODEL_REGEX = /^gemini-[\w.-]+$/;

// A deprecated-but-well-formed id is shape-valid, so flag it separately — the server discards it and runs the default.
const modelFieldError = (value: string, showCustom: boolean): string | null => {
  if (!showCustom || value === '') return null;
  if (!GEMINI_MODEL_REGEX.test(value)) {
    return 'Must match pattern: gemini-[name] (letters, digits, dots, hyphens, underscores)';
  }
  if (isDeprecatedGeminiModelId(value)) {
    return 'Deprecated model — the server ignores this override and uses the default. Choose a current model.';
  }
  return null;
};

const DEFAULT_ADVANCED_MODEL = 'gemini-3.7-flash';
const DEFAULT_STANDARD_MODEL = 'gemini-3.5-flash-lite';

/**
 * Shared UI for configuring Gemini model overrides on the `gemini-functions`
 * permission. Renders in two visual variants: `inline` for list view and
 * `expanded` for grid view.
 */
const GeminiModelConfigSection: React.FC<{
  variant: 'inline' | 'expanded';
  permission: GlobalFeaturePermission;
  onUpdate: (updates: Partial<GlobalFeaturePermission>) => void;
}> = ({ variant, permission, onUpdate }) => {
  const advancedModel = (permission.config?.advancedModel as string) ?? '';
  const standardModel = (permission.config?.standardModel as string) ?? '';

  const isCustomAdvanced =
    advancedModel !== '' &&
    !KNOWN_GEMINI_MODELS.some((m) => m.value === advancedModel);
  const isCustomStandard =
    standardModel !== '' &&
    !KNOWN_GEMINI_MODELS.some((m) => m.value === standardModel);

  const [showCustomAdvanced, setShowCustomAdvanced] =
    React.useState(isCustomAdvanced);
  const [showCustomStandard, setShowCustomStandard] =
    React.useState(isCustomStandard);

  const advancedError = modelFieldError(advancedModel, showCustomAdvanced);
  const standardError = modelFieldError(standardModel, showCustomStandard);

  const handleSelectChange = (
    field: 'advancedModel' | 'standardModel',
    value: string,
    setShowCustom: (v: boolean) => void
  ) => {
    if (value === '__custom__') {
      setShowCustom(true);
      onUpdate({
        config: { ...permission.config, [field]: '' },
      });
    } else {
      setShowCustom(false);
      onUpdate({
        config: { ...permission.config, [field]: value },
      });
    }
  };

  const handleCustomInput = (
    field: 'advancedModel' | 'standardModel',
    value: string
  ) => {
    onUpdate({
      config: { ...permission.config, [field]: value },
    });
  };

  const getSelectValue = (
    currentValue: string,
    showCustom: boolean
  ): string => {
    if (showCustom) return '__custom__';
    if (currentValue === '') return '';
    const known = KNOWN_GEMINI_MODELS.find((m) => m.value === currentValue);
    return known ? currentValue : '__custom__';
  };

  const isInline = variant === 'inline';

  const containerClass = isInline
    ? 'border-t border-slate-100 bg-purple-50 p-4'
    : 'mb-6 p-4 bg-purple-50 rounded-xl border border-purple-100';

  const layoutClass = isInline
    ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
    : 'space-y-3';

  const inputClass = isInline
    ? 'w-full px-3 py-1.5 border rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500'
    : 'w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500';

  const selectClass = isInline
    ? 'w-full px-3 py-1.5 border border-purple-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white'
    : 'w-full px-3 py-2 border border-purple-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white';

  const renderModelField = (
    label: string,
    field: 'advancedModel' | 'standardModel',
    currentValue: string,
    defaultModel: string,
    tier: string,
    showCustom: boolean,
    setShowCustom: (v: boolean) => void,
    error: string | null
  ) => (
    <div>
      <label className="text-xxs font-bold text-purple-700 uppercase tracking-widest mb-1 block">
        {label}
      </label>
      <select
        value={getSelectValue(currentValue, showCustom)}
        onChange={(e) =>
          handleSelectChange(field, e.target.value, setShowCustom)
        }
        className={selectClass}
      >
        <option value="">Default ({defaultModel})</option>
        {KNOWN_GEMINI_MODELS.filter((m) => m.tier === tier).map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
        <option value="__custom__">Custom...</option>
      </select>
      {showCustom && (
        <div className="mt-1.5">
          <input
            type="text"
            placeholder="e.g. gemini-2.5-flash"
            value={currentValue}
            onChange={(e) => handleCustomInput(field, e.target.value)}
            aria-invalid={error !== null}
            className={`${inputClass} ${
              error !== null
                ? 'border-red-400 focus:ring-red-400'
                : 'border-purple-200'
            }`}
          />
          {error !== null && (
            <p className="text-xxs text-red-600 mt-0.5">{error}</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={containerClass}>
      <label className="text-xs font-bold text-purple-700 uppercase tracking-widest mb-2 block">
        Gemini Model Overrides
      </label>
      <div className={layoutClass}>
        {renderModelField(
          'Advanced Model (mini-apps, guided learning)',
          'advancedModel',
          advancedModel,
          DEFAULT_ADVANCED_MODEL,
          'advanced',
          showCustomAdvanced,
          setShowCustomAdvanced,
          advancedError
        )}
        {renderModelField(
          'Standard Model (OCR, polls, quizzes)',
          'standardModel',
          standardModel,
          DEFAULT_STANDARD_MODEL,
          'standard',
          showCustomStandard,
          setShowCustomStandard,
          standardError
        )}
      </div>
    </div>
  );
};

export const GlobalPermissionsManager: React.FC = () => {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const effectiveViewMode = isMobile ? 'grid' : viewMode;
  const [showFilters, setShowFilters] = useState(false);
  const [permissions, setPermissions] = useState<
    Map<string, GlobalFeaturePermission>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState<Set<string>>(new Set());

  const { user, appSettings, updateAppSettings } = useAuth();
  const { query } = useAccessSearch();
  const isSearching = query.trim() !== '';
  const { uploadAdminLogo, deleteAdminLogo, uploading } = useStorage();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Filter state
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'on' | 'off'>(
    'all'
  );

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showMessage('error', 'Please upload an image file');
      return;
    }

    const MAX_LOGO_SIZE_MB = 1; // 1MB limit for logos
    if (file.size > MAX_LOGO_SIZE_MB * 1024 * 1024) {
      showMessage(
        'error',
        `Logo file size cannot exceed ${MAX_LOGO_SIZE_MB}MB.`
      );
      return;
    }

    try {
      const url = await uploadAdminLogo(file);
      await updateAppSettings({ logoUrl: url });
      showMessage('success', 'Logo updated successfully');
    } catch (error) {
      console.error('Error uploading logo:', error);
      showMessage('error', 'Failed to upload logo');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await deleteAdminLogo();
      await updateAppSettings({ logoUrl: '' });
      showMessage('success', 'Logo removed successfully');
    } catch (error) {
      console.error('Error removing logo:', error);
      showMessage('error', 'Failed to remove logo');
    }
  };

  const [filterAvailability, setFilterAvailability] = useState<
    'all' | AccessLevel
  >('all');

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    const timeoutId = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timeoutId);
  }, []);

  const loadPermissions = useCallback(async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'global_permissions'));
      const permMap = new Map<string, GlobalFeaturePermission>();

      snapshot.forEach((doc) => {
        const data = doc.data() as GlobalFeaturePermission;
        permMap.set(data.featureId, data);
      });

      setPermissions(permMap);
    } catch (error) {
      console.error('Error loading global permissions:', error);
      showMessage('error', 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  const getPermission = (featureId: GlobalFeature): GlobalFeaturePermission => {
    const defaults = FEATURE_DEFAULTS[featureId];

    // Set smart default limits
    let defaultLimit = 20;
    if (featureId === 'video-activity-audio-transcription') {
      defaultLimit = 5;
    }

    return (
      permissions.get(featureId) ?? {
        featureId,
        accessLevel: defaults.defaultAccessLevel,
        betaUsers: [],
        enabled: defaults.defaultEnabled,
        buildings: [],
        // Seed the synthetic permission's `minTier` from the in-code default so
        // the admin editor shows the effective tier floor that `canAccessFeature`
        // already enforces on the missing-doc path (e.g. google-classroom /
        // ai-file-context default to 'org'). Omit the field when there's no
        // default so the "Any tier" option stays selected for pre-tier features.
        ...(defaults.defaultMinTier
          ? { minTier: defaults.defaultMinTier }
          : {}),
        config: GEMINI_FEATURES.includes(featureId)
          ? { dailyLimit: defaultLimit, dailyLimitEnabled: true }
          : {},
      }
    );
  };

  const updatePermission = (
    featureId: GlobalFeature,
    updates: Partial<GlobalFeaturePermission>
  ) => {
    // Functional setState so rapid back-to-back calls (e.g. toggling several
    // Assignment Mode widgets in one tick) all merge against the latest
    // permissions/unsavedChanges instead of a stale closure.
    setPermissions((prev) => {
      const current = prev.get(featureId) ?? getPermission(featureId);
      return new Map(prev).set(featureId, { ...current, ...updates });
    });
    setUnsavedChanges((prev) => new Set(prev).add(featureId));
  };

  const savePermission = async (featureId: GlobalFeature) => {
    try {
      setSaving((prev) => new Set(prev).add(featureId));
      const permission = getPermission(featureId);

      // Firestore rejects explicit `undefined` values; "no minimum tier"
      // is modeled as an absent field, so strip it before persisting.
      const { minTier, ...withoutMinTier } = permission;
      await setDoc(
        doc(db, 'global_permissions', featureId),
        minTier === undefined ? withoutMinTier : permission
      );

      // Audit log for model config changes
      if (
        featureId === 'gemini-functions' &&
        (permission.config?.advancedModel || permission.config?.standardModel)
      ) {
        try {
          await addDoc(collection(db, 'admin_audit_log'), {
            action: 'model_config_change',
            email: user?.email ?? '(unknown)',
            timestamp: serverTimestamp(),
            advancedModel:
              (permission.config?.advancedModel as string) || '(default)',
            standardModel:
              (permission.config?.standardModel as string) || '(default)',
          });
        } catch (auditErr) {
          // Non-blocking — don't fail the save if audit logging fails.
          // Route through `logError` so the failure surfaces in structured
          // logs / future Sentry, not just the local browser console. The
          // save itself already succeeded; this is purely an audit-trail
          // gap that ops needs to be able to see and triage.
          logError(
            'GlobalPermissionsManager.savePermission.auditLog',
            auditErr,
            { featureId, email: user?.email ?? null }
          );
        }
      }

      setUnsavedChanges((prev) => {
        const next = new Set(prev);
        next.delete(featureId);
        return next;
      });

      showMessage('success', `Saved ${featureId} settings`);
    } catch (error) {
      console.error('Error saving permission:', error);
      showMessage('error', `Failed to save ${featureId} settings`);
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(featureId);
        return next;
      });
    }
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

  const filteredFeatures = useMemo(() => {
    const sorted = GLOBAL_SETTINGS_FEATURES.map((id) => ({
      id,
      ...FEATURE_DEFAULTS[id],
    })).sort((a, b) => a.label.localeCompare(b.label));
    return sorted.filter((feature) => {
      const defaults = FEATURE_DEFAULTS[feature.id];
      const perm = permissions.get(feature.id) ?? {
        featureId: feature.id,
        accessLevel: defaults.defaultAccessLevel,
        betaUsers: [] as string[],
        enabled: defaults.defaultEnabled,
        config: feature.id === 'gemini-functions' ? { dailyLimit: 20 } : {},
      };
      if (filterEnabled === 'on' && !perm.enabled) return false;
      if (filterEnabled === 'off' && perm.enabled) return false;
      if (
        filterAvailability !== 'all' &&
        perm.accessLevel !== filterAvailability
      )
        return false;
      return matchesSearch(query, featureSearchFields(feature.id));
    });
  }, [permissions, filterEnabled, filterAvailability, query]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading global settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}

      <AdminSearchField tab="global" placeholder="Search global settings" />

      {/* Global Branding */}
      {!isSearching && (
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 mb-6 hover:border-brand-blue-light transition-all text-left">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-brand-blue-lighter p-3 rounded-xl text-brand-blue-primary">
              <Shield className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-800 text-lg">Custom Logo</h4>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="w-16 h-16 bg-slate-200 rounded-xl flex items-center justify-center overflow-hidden shrink-0 border border-slate-300">
              {appSettings?.logoUrl ? (
                <img
                  src={appSettings.logoUrl}
                  alt="Custom Logo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <LayoutGrid className="w-8 h-8 text-slate-400" />
              )}
            </div>

            <div className="flex-1 flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={(e) => void handleLogoUpload(e)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 bg-brand-blue-primary text-white text-sm font-bold rounded-lg shadow-sm hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload Logo'}
              </button>

              {appSettings?.logoUrl && (
                <button
                  onClick={() => void handleRemoveLogo()}
                  disabled={uploading}
                  className="px-4 py-2 bg-white text-red-600 text-sm font-bold border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  Remove Logo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modes */}
      {!isSearching &&
        (() => {
          const assignmentPermission = getPermission('assignment-modes');
          // `permission.config` is an admin-writable Firestore blob and could
          // be any shape (a stale string, an array, etc.). Run it through the
          // trust-boundary parser so the toggle UI never spreads a non-object
          // into the saved config.
          const config = parseAssignmentModesConfig(
            assignmentPermission.config
          );
          const isSavingAssignment = saving.has('assignment-modes');
          const hasUnsaved = unsavedChanges.has('assignment-modes');

          const setMode = (
            widget: AssignmentWidgetKey,
            mode: AssignmentMode
          ) => {
            updatePermission('assignment-modes', {
              accessLevel: 'public',
              enabled: true,
              config: { ...config, [widget]: mode },
            });
          };

          return (
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 mb-6 hover:border-brand-blue-light transition-all text-left">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-brand-blue-lighter p-3 rounded-xl text-brand-blue-primary">
                  <ClipboardCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-lg">
                    Assignment Modes
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Applies to new assignments only.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {ASSIGNMENT_WIDGETS.map(({ key, label, Icon }) => {
                  const currentMode: AssignmentMode =
                    config[key] === 'view-only' ? 'view-only' : 'submissions';

                  return (
                    <div
                      key={key}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <Icon className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 font-bold text-sm text-slate-800">
                          {label}
                        </div>
                      </div>
                      <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 shrink-0 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => setMode(key, 'submissions')}
                          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                            currentMode === 'submissions'
                              ? 'bg-brand-blue-primary text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-800'
                          }`}
                          aria-pressed={currentMode === 'submissions'}
                        >
                          <Send className="w-3.5 h-3.5" />
                          Submissions
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode(key, 'view-only')}
                          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                            currentMode === 'view-only'
                              ? 'bg-brand-blue-primary text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-800'
                          }`}
                          aria-pressed={currentMode === 'view-only'}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View only
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => savePermission('assignment-modes')}
                disabled={isSavingAssignment || !hasUnsaved}
                className={`mt-4 w-full py-3 rounded-xl transition-all flex items-center justify-center gap-2 font-bold text-sm shadow-md disabled:opacity-50 ${
                  hasUnsaved
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-brand-blue-primary hover:bg-brand-blue-dark text-white'
                }`}
              >
                {isSavingAssignment ? (
                  'Saving...'
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {hasUnsaved ? 'Save Changes' : 'Settings Up-to-Date'}
                  </>
                )}
              </button>
            </div>
          );
        })()}

      {/* Filters */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl mb-2">
        {/* Filter header row */}
        <div className="flex items-center gap-2 p-2 md:p-3">
          {/* Mobile: collapsible filter toggle */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5 text-slate-500 md:hidden"
            aria-expanded={showFilters}
            aria-controls="global-perm-mobile-filters"
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
          </div>

          {/* View Mode Toggle - hidden on mobile */}
          <div className="ml-auto hidden md:flex bg-white p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
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
              type="button"
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
            id="global-perm-mobile-filters"
            className="flex flex-col gap-3 px-3 pb-3 border-t border-slate-200 pt-3 md:hidden"
          >
            {renderEnabledFilter()}
            {renderAvailabilityFilter()}
          </div>
        )}
      </div>

      <>
        {filteredFeatures.length === 0 && (
          <AccessSearchEmpty
            tab="global"
            fallback="No features match the current filters."
          />
        )}
        <div
          className={
            effectiveViewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6'
              : 'space-y-3'
          }
        >
          {filteredFeatures.map((feature) => {
            const permission = getPermission(feature.id);
            const isSaving = saving.has(feature.id);
            // No permission doc yet, so the controls show defaults.
            const isSyntheticDefault = !permissions.has(feature.id);
            const notSavedBadge = isSyntheticDefault ? (
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-xxs font-bold text-amber-800">
                Not saved
              </span>
            ) : null;

            if (effectiveViewMode === 'list') {
              return (
                <div
                  key={feature.id}
                  className="bg-white border-2 border-slate-200 rounded-xl hover:border-brand-blue-light transition-colors overflow-hidden"
                >
                  <div className="flex items-center gap-4 p-3">
                    {/* Identity Section */}
                    <div className="flex items-center gap-3 w-56 xl:w-72 shrink-0">
                      <div className="bg-brand-blue-lighter p-2 rounded-lg text-brand-blue-primary shrink-0">
                        <feature.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h4 className="font-bold text-slate-800 text-sm truncate">
                            {feature.label}
                          </h4>
                          {notSavedBadge}
                        </div>
                        <p className="text-xxs text-slate-500 truncate">
                          {feature.description}
                        </p>
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
                          updatePermission(feature.id, {
                            enabled: checked,
                          })
                        }
                        size="sm"
                        label={`${feature.label} enabled`}
                      />
                    </div>

                    {/* Access Level Controls */}
                    <div className="flex items-center gap-1 ml-4">
                      {(['admin', 'beta', 'public'] as AccessLevel[]).map(
                        (level) => (
                          <button
                            key={level}
                            onClick={() =>
                              updatePermission(feature.id, {
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

                    {/* Feature Specific Config (Gemini Limit) */}
                    {GEMINI_FEATURES.includes(feature.id) && (
                      <div className="flex items-center gap-3 ml-4 px-4 py-1.5 bg-purple-50 rounded-lg border border-purple-100">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xxs font-black text-purple-700 uppercase tracking-widest leading-none mb-0.5">
                            Limit
                          </span>
                          <Toggle
                            checked={
                              (permission.config
                                ?.dailyLimitEnabled as boolean) ?? true
                            }
                            onChange={(checked) =>
                              updatePermission(feature.id, {
                                config: {
                                  ...permission.config,
                                  dailyLimitEnabled: checked,
                                },
                              })
                            }
                            size="xs"
                            label={`${feature.label} daily limit`}
                          />
                        </div>

                        <div className="w-px h-6 bg-purple-200" />

                        <div className="flex flex-col gap-0.5">
                          <span className="text-xxs font-black text-purple-700 uppercase tracking-widest leading-none">
                            Daily Max
                          </span>
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            disabled={
                              !(
                                (permission.config
                                  ?.dailyLimitEnabled as boolean) ?? true
                              )
                            }
                            value={
                              (permission.config?.dailyLimit as number) ??
                              (feature.id ===
                              'video-activity-audio-transcription'
                                ? 5
                                : 20)
                            }
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updatePermission(feature.id, {
                                config: {
                                  ...permission.config,
                                  dailyLimit: isNaN(val) ? 20 : val,
                                },
                              });
                            }}
                            className="w-14 px-1 py-0 border border-purple-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex-1" />

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-100">
                      <button
                        onClick={() => savePermission(feature.id)}
                        disabled={isSaving || !unsavedChanges.has(feature.id)}
                        className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          unsavedChanges.has(feature.id)
                            ? 'bg-orange-600 hover:bg-orange-700 text-white'
                            : 'text-slate-300 hover:bg-brand-blue-primary hover:text-white'
                        }`}
                        title={
                          unsavedChanges.has(feature.id)
                            ? 'Save Changes'
                            : 'No changes to save'
                        }
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Building Restriction */}
                  <div className="border-t border-slate-100 bg-slate-50 p-4 text-left">
                    <PermissionBuildingMultiSelect
                      label="Restrict to buildings"
                      selectedIds={permission.buildings ?? []}
                      onChange={(buildings) =>
                        updatePermission(feature.id, { buildings })
                      }
                    />
                  </div>

                  {/* Minimum Tier */}
                  <div className="border-t border-slate-100 bg-slate-50 p-4">
                    <MinTierSelect
                      value={permission.minTier}
                      onChange={(minTier) =>
                        updatePermission(feature.id, { minTier })
                      }
                    />
                  </div>

                  {permission.accessLevel === 'beta' && (
                    <div className="border-t border-slate-100 bg-slate-50">
                      <BetaUsersPanel
                        betaUsers={permission.betaUsers}
                        onChange={(betaUsers) =>
                          updatePermission(feature.id, { betaUsers })
                        }
                        showMessage={showMessage}
                        variant="expanded"
                      />
                    </div>
                  )}

                  {/* Gemini Model Config (gemini-functions only) */}
                  {feature.id === 'gemini-functions' && (
                    <GeminiModelConfigSection
                      variant="inline"
                      permission={permission}
                      onUpdate={(updates) =>
                        updatePermission(feature.id, updates)
                      }
                    />
                  )}
                </div>
              );
            }

            return (
              <div
                key={feature.id}
                className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-brand-blue-light transition-all text-left"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="bg-brand-blue-lighter p-3 rounded-xl text-brand-blue-primary">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-800 text-lg">
                        {feature.label}
                      </h4>
                      {notSavedBadge}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>

                {/* Enabled Toggle */}
                <div className="flex items-center justify-between mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                    Feature Enabled
                  </span>
                  <Toggle
                    checked={permission.enabled}
                    onChange={(checked) =>
                      updatePermission(feature.id, {
                        enabled: checked,
                      })
                    }
                    size="md"
                    label={`${feature.label} enabled`}
                  />
                </div>

                {/* Access Level */}
                <div className="mb-6">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                    Who can access this?
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['admin', 'beta', 'public'] as AccessLevel[]).map(
                      (level) => (
                        <button
                          key={level}
                          onClick={() =>
                            updatePermission(feature.id, {
                              accessLevel: level,
                            })
                          }
                          className={`px-3 py-3 rounded-xl border-2 text-xs font-bold flex flex-col items-center justify-center gap-2 transition-all ${
                            permission.accessLevel === level
                              ? getAccessLevelColor(level)
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {getAccessLevelIcon(level)}
                          <span className="capitalize">{level}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>

                {permission.accessLevel === 'beta' && (
                  <div className="mb-6">
                    <BetaUsersPanel
                      betaUsers={permission.betaUsers}
                      onChange={(betaUsers) =>
                        updatePermission(feature.id, { betaUsers })
                      }
                      showMessage={showMessage}
                    />
                  </div>
                )}

                {/* Feature Specific Config (Gemini Limit) */}
                {GEMINI_FEATURES.includes(feature.id) && (
                  <div className="mb-6 p-4 bg-purple-50 rounded-xl border border-purple-100">
                    <div className="flex items-center justify-between mb-4">
                      <label className="text-xs font-bold text-purple-700 uppercase tracking-widest block">
                        Daily Usage Limit
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-xxs font-black text-purple-400 uppercase tracking-widest">
                          {((permission.config?.dailyLimitEnabled as boolean) ??
                          true)
                            ? 'Enabled'
                            : 'Disabled'}
                        </span>
                        <Toggle
                          checked={
                            (permission.config?.dailyLimitEnabled as boolean) ??
                            true
                          }
                          label={`${feature.label} daily limit`}
                          onChange={(checked) =>
                            updatePermission(feature.id, {
                              config: {
                                ...permission.config,
                                dailyLimitEnabled: checked,
                              },
                            })
                          }
                          size="sm"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        disabled={
                          !(
                            (permission.config?.dailyLimitEnabled as boolean) ??
                            true
                          )
                        }
                        value={
                          (permission.config?.dailyLimit as number) ??
                          (feature.id === 'video-activity-audio-transcription'
                            ? 5
                            : 20)
                        }
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          updatePermission(feature.id, {
                            config: {
                              ...permission.config,
                              dailyLimit: isNaN(val) ? 20 : val,
                            },
                          });
                        }}
                        className="w-24 px-3 py-2 border border-purple-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                      />
                      <span className="text-xs text-purple-600 font-medium">
                        generations per day
                      </span>
                    </div>
                    <p className="text-xxs text-purple-500 mt-2 leading-tight">
                      Admins are unlimited.
                    </p>
                  </div>
                )}

                {/* Gemini Model Config (gemini-functions only) */}
                {feature.id === 'gemini-functions' && (
                  <GeminiModelConfigSection
                    variant="expanded"
                    permission={permission}
                    onUpdate={(updates) =>
                      updatePermission(feature.id, updates)
                    }
                  />
                )}

                {/* Building Restriction */}
                <div className="mb-6">
                  <PermissionBuildingMultiSelect
                    label="Restrict to buildings"
                    selectedIds={permission.buildings ?? []}
                    onChange={(buildings) =>
                      updatePermission(feature.id, { buildings })
                    }
                  />
                </div>

                {/* Minimum Tier */}
                <div className="mb-6">
                  <MinTierSelect
                    value={permission.minTier}
                    onChange={(minTier) =>
                      updatePermission(feature.id, { minTier })
                    }
                  />
                </div>

                {/* Save Button */}
                <button
                  onClick={() => savePermission(feature.id)}
                  disabled={isSaving || !unsavedChanges.has(feature.id)}
                  className={`w-full py-3 rounded-xl transition-all flex items-center justify-center gap-2 font-bold text-sm shadow-md disabled:opacity-50 ${
                    unsavedChanges.has(feature.id)
                      ? 'bg-orange-600 hover:bg-orange-700 text-white'
                      : 'bg-brand-blue-primary hover:bg-brand-blue-dark text-white'
                  }`}
                >
                  {isSaving ? (
                    'Saving...'
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {unsavedChanges.has(feature.id)
                        ? 'Save Changes'
                        : 'Settings Up-to-Date'}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </>
    </div>
  );
};

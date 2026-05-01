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
  Plus,
  Trash2,
  Zap,
  Cast,
  Share2,
  Download,
  Wand2,
  ClipboardCheck,
  BarChart,
  Smartphone,
  LayoutGrid,
  List,
  Filter,
  ChevronDown,
  FileUp,
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
import { Toggle } from '../common/Toggle';
import { Toast } from '../common/Toast';

const GLOBAL_FEATURES: {
  id: GlobalFeature;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  {
    id: 'gemini-functions',
    label: 'Gemini AI Functions',
    icon: Zap,
    description: 'AI-powered mini-app generation, poll generation, and more.',
  },
  {
    id: 'live-session',
    label: 'Live Sessions',
    icon: Cast,
    description: 'Ability to host live sessions and sync with students.',
  },
  {
    id: 'remote-control',
    label: 'Remote Control',
    icon: Smartphone,
    description:
      'Control your board from your phone while you move around the classroom.',
  },
  {
    id: 'dashboard-sharing',
    label: 'Board Sharing',
    icon: Share2,
    description: 'Generate shareable links for dashboards.',
  },
  {
    id: 'dashboard-import',
    label: 'Board Importing',
    icon: Download,
    description: 'Import dashboards from JSON strings.',
  },
  {
    id: 'magic-layout',
    label: 'Magic Layout',
    icon: Wand2,
    description: 'AI-powered automatic dashboard layout generation.',
  },
  {
    id: 'smart-paste',
    label: 'Smart Paste',
    icon: ClipboardCheck,
    description: 'Intelligent clipboard handling to auto-create widgets.',
  },
  {
    id: 'smart-poll',
    label: 'Smart Polls',
    icon: BarChart,
    description: 'AI-assisted poll question and option generation.',
  },
  {
    id: 'embed-mini-app',
    label: 'Embed: Generate Mini App',
    icon: Wand2,
    description:
      'AI button inside Embed widgets that generates an interactive mini app from the embedded content.',
  },
  {
    id: 'video-activity-audio-transcription',
    label: 'Video Activity Audio Transcription',
    icon: Wand2,
    description:
      'Allow generating quizzes from videos that do not have captions, using Gemini AI audio transcription.',
  },
  {
    id: 'ai-file-context',
    label: 'AI File Context (Drive)',
    icon: FileUp,
    description:
      'Allow attaching Google Drive files as context when generating with AI.',
  },
  {
    id: 'share-link-tracking',
    label: 'Share-link View Tracking',
    icon: Eye,
    description:
      'Show "N views" on view-only Share cards in the Quiz, Video Activity, Mini App, and Guided Learning archives. Each visible card fires a Firestore aggregation query when the dashboard tab regains focus — keep this Admin-only unless you specifically want every teacher to see open counts.',
  },
];

/**
 * Features whose missing-permission default is `'admin'` instead of the
 * usual `'public'`. Both `getPermission` (the editor's persisted-or-default
 * resolver) and `filteredFeatures` (the toolbar filter's fallback) read
 * from this set so the fallback rule is defined once. Any divergence
 * between the two would silently mis-categorize a feature in the access-
 * level filter when no permission doc exists yet.
 *
 * Keep this aligned with the runtime-side defaults in `AuthContext` —
 * `canSeeShareTracking` likewise treats a missing 'share-link-tracking'
 * record as admin-only.
 */
const ADMIN_ONLY_DEFAULT_FEATURES: ReadonlySet<GlobalFeature> =
  new Set<GlobalFeature>(['embed-mini-app', 'share-link-tracking']);

/**
 * Widgets surfaced in the Assignment Modes admin section. All four widgets
 * with student-facing assignment flows are listed; flipping any of them to
 * View only swaps the teacher Assign button to Share, hides the In Progress
 * tab in favor of Shared, blocks submissions, and starts logging URL views.
 */
const ASSIGNMENT_WIDGETS: {
  key: AssignmentWidgetKey;
  label: string;
  description: string;
  Icon: React.ElementType;
}[] = [
  {
    key: 'quiz',
    label: 'Quiz',
    description:
      'Submissions: live monitor + response tracking. View only: students see the quiz as a read-through with no answer collection.',
    Icon: ListChecks,
  },
  {
    key: 'videoActivity',
    label: 'Video Activity',
    description:
      'Submissions: responses and completion are tracked. View only: each Share link plays the video with the questions visible but unanswerable.',
    Icon: PlayCircle,
  },
  {
    key: 'miniApp',
    label: 'Mini Apps',
    description:
      'Submissions: students can submit answers from the app. View only: each Share link is just a viewable URL.',
    Icon: Boxes,
  },
  {
    key: 'guidedLearning',
    label: 'Guided Learning',
    description:
      'Submissions: responses and scores are collected. View only: students walk through the lesson with no grading or roster tracking.',
    Icon: BookOpen,
  },
];

const GEMINI_FEATURES: GlobalFeature[] = [
  'gemini-functions',
  'smart-poll',
  'embed-mini-app',
  'video-activity-audio-transcription',
  'ai-file-context',
];

const KNOWN_GEMINI_MODELS = [
  {
    value: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash (Preview)',
    tier: 'advanced',
  },
  {
    value: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite (Preview)',
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
  {
    value: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    tier: 'advanced',
  },
  {
    value: 'gemini-2.0-flash-lite',
    label: 'Gemini 2.0 Flash Lite',
    tier: 'standard',
  },
] as const;

const GEMINI_MODEL_REGEX = /^gemini-[\w.-]+$/;

const DEFAULT_ADVANCED_MODEL = 'gemini-3-flash-preview';
const DEFAULT_STANDARD_MODEL = 'gemini-3.1-flash-lite-preview';

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

  const advancedError =
    showCustomAdvanced &&
    advancedModel !== '' &&
    !GEMINI_MODEL_REGEX.test(advancedModel);
  const standardError =
    showCustomStandard &&
    standardModel !== '' &&
    !GEMINI_MODEL_REGEX.test(standardModel);

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
    hasError: boolean
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
            className={`${inputClass} ${
              hasError
                ? 'border-red-400 focus:ring-red-400'
                : 'border-purple-200'
            }`}
          />
          {hasError && (
            <p className="text-xxs text-red-600 mt-0.5">
              Must match pattern: gemini-[name] (letters, digits, dots, hyphens,
              underscores)
            </p>
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
      <p className="text-xxs text-purple-500 mt-2 leading-tight">
        Override the AI models used by Cloud Functions. Leave as
        &quot;Default&quot; to use the built-in model for each tier.
      </p>
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
    const defaultAccessLevel: AccessLevel = ADMIN_ONLY_DEFAULT_FEATURES.has(
      featureId
    )
      ? 'admin'
      : 'public';

    // Set smart default limits
    let defaultLimit = 20;
    if (featureId === 'video-activity-audio-transcription') {
      defaultLimit = 5;
    }

    return (
      permissions.get(featureId) ?? {
        featureId,
        accessLevel: defaultAccessLevel,
        betaUsers: [],
        enabled: true,
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
    const current = getPermission(featureId);
    const updated = { ...current, ...updates };
    setPermissions(new Map(permissions).set(featureId, updated));
    setUnsavedChanges(new Set(unsavedChanges).add(featureId));
  };

  const savePermission = async (featureId: GlobalFeature) => {
    try {
      setSaving(new Set(saving).add(featureId));
      const permission = getPermission(featureId);

      await setDoc(doc(db, 'global_permissions', featureId), permission);

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
          // Non-blocking — don't fail the save if audit logging fails
          console.error('Failed to write audit log:', auditErr);
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

  const addBetaUser = (featureId: GlobalFeature, email: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      showMessage('error', 'Please enter a valid email address.');
      return;
    }

    const permission = getPermission(featureId);
    if (!permission.betaUsers.includes(trimmedEmail)) {
      updatePermission(featureId, {
        betaUsers: [...permission.betaUsers, trimmedEmail],
      });
    }
  };

  const removeBetaUser = (featureId: GlobalFeature, email: string) => {
    const permission = getPermission(featureId);
    updatePermission(featureId, {
      betaUsers: permission.betaUsers.filter((e) => e !== email),
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

  const filteredFeatures = useMemo(() => {
    const sorted = [...GLOBAL_FEATURES].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    return sorted.filter((feature) => {
      const perm = permissions.get(feature.id) ?? {
        featureId: feature.id,
        accessLevel: (ADMIN_ONLY_DEFAULT_FEATURES.has(feature.id)
          ? 'admin'
          : 'public') as AccessLevel,
        betaUsers: [] as string[],
        enabled: true,
        config: feature.id === 'gemini-functions' ? { dailyLimit: 20 } : {},
      };
      if (filterEnabled === 'on' && !perm.enabled) return false;
      if (filterEnabled === 'off' && perm.enabled) return false;
      if (
        filterAvailability !== 'all' &&
        perm.accessLevel !== filterAvailability
      )
        return false;
      return true;
    });
  }, [permissions, filterEnabled, filterAvailability]);

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

      {/* Global Branding */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 mb-6 hover:border-brand-blue-light transition-all text-left">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-brand-blue-lighter p-3 rounded-xl text-brand-blue-primary">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-lg">Custom Logo</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Upload a custom logo to replace the default SpartBoard logo in the
              sidebar header.
            </p>
          </div>
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

      {/* Assignment Modes */}
      {(() => {
        const assignmentPermission = getPermission('assignment-modes');
        // `permission.config` is an admin-writable Firestore blob and could
        // be any shape (a stale string, an array, etc.). Run it through the
        // trust-boundary parser so the toggle UI never spreads a non-object
        // into the saved config.
        const config = parseAssignmentModesConfig(assignmentPermission.config);
        const isSavingAssignment = saving.has('assignment-modes');
        const hasUnsaved = unsavedChanges.has('assignment-modes');

        const setMode = (widget: AssignmentWidgetKey, mode: AssignmentMode) => {
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
                  Choose whether each student-facing widget collects submissions
                  or only generates view-only share links. Mode is locked at
                  assignment creation, so flipping a toggle only affects new
                  assignments.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {ASSIGNMENT_WIDGETS.map(({ key, label, description, Icon }) => {
                const currentMode: AssignmentMode =
                  config[key] === 'view-only' ? 'view-only' : 'submissions';

                return (
                  <div
                    key={key}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <Icon className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-800">
                          {label}
                        </div>
                        <div className="text-xs text-slate-500 leading-snug">
                          {description}
                        </div>
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
          <div className="py-12 text-center text-slate-400">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="font-medium">
              No features match the current filters.
            </p>
          </div>
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
                        <h4 className="font-bold text-slate-800 text-sm truncate">
                          {feature.label}
                        </h4>
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

                  {/* Beta Users Panel */}
                  {permission.accessLevel === 'beta' && (
                    <div className="border-t border-slate-100 bg-slate-50 p-4 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                        Beta Testers
                      </label>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {permission.betaUsers.map((email) => (
                          <div
                            key={email}
                            className="flex items-center gap-2 px-3 py-1 bg-white border border-blue-100 rounded-full group shadow-sm"
                          >
                            <span className="text-xs font-medium text-slate-700">
                              {email}
                            </span>
                            <button
                              onClick={() => removeBetaUser(feature.id, email)}
                              className="text-red-500 hover:text-red-700 p-0.5 rounded-full transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 max-w-md">
                        <input
                          type="email"
                          placeholder="user@example.com"
                          className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary bg-white shadow-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              addBetaUser(
                                feature.id,
                                (e.target as HTMLInputElement).value
                              );
                              (e.target as HTMLInputElement).value = '';
                            }
                          }}
                        />
                        <button
                          onClick={(e) => {
                            const input = e.currentTarget
                              .previousElementSibling as HTMLInputElement;
                            addBetaUser(feature.id, input.value);
                            input.value = '';
                          }}
                          className="p-1.5 bg-brand-blue-primary text-white rounded-lg hover:bg-brand-blue-dark transition-colors shadow-sm"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
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
                    <h4 className="font-bold text-slate-800 text-lg">
                      {feature.label}
                    </h4>
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

                {/* Beta Users */}
                {permission.accessLevel === 'beta' && (
                  <div className="mb-6 animate-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                      Beta Testers
                    </label>
                    <div className="space-y-2 mb-3">
                      {permission.betaUsers.map((email) => (
                        <div
                          key={email}
                          className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-100 rounded-lg group"
                        >
                          <span className="text-xs font-medium text-slate-700">
                            {email}
                          </span>
                          <button
                            onClick={() => removeBetaUser(feature.id, email)}
                            className="text-red-500 hover:bg-red-100 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="user@example.com"
                        className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            addBetaUser(
                              feature.id,
                              (e.target as HTMLInputElement).value
                            );
                            (e.target as HTMLInputElement).value = '';
                          }
                        }}
                      />
                      <button
                        onClick={(e) => {
                          const input = e.currentTarget
                            .previousElementSibling as HTMLInputElement;
                          addBetaUser(feature.id, input.value);
                          input.value = '';
                        }}
                        className="p-2.5 bg-brand-blue-primary text-white rounded-xl hover:bg-brand-blue-dark transition-colors shadow-md"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
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
                      Administrators have unlimited usage. Standard users will
                      see a &quot;limit reached&quot; message after this many
                      generations.
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

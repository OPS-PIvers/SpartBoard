import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Save,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  Wand2,
  Camera,
  ChevronLeft,
  Package,
  LayoutGrid,
  LayoutTemplate,
  ChevronDown,
} from 'lucide-react';
import {
  collection,
  onSnapshot,
  query,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import {
  StarterPack,
  WidgetType,
  WidgetData,
  StarterPackGlobalConfig,
  FeaturePermission,
} from '@/types';
import { ALL_GRADE_LEVELS } from '@/config/widgetGradeLevels';
import { TOOLS } from '@/config/tools';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { useDashboard } from '@/context/useDashboard';
import { createBoardSnapshot } from '@/utils/widgetHelpers';
import { Toast } from '@/components/common/Toast';
import { Modal } from '@/components/common/Modal';
import { useDialog } from '@/context/useDialog';
import { DockDefaultsPanel } from './DockDefaultsPanel';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SNAP_LAYOUTS } from '@/config/snapLayouts';
import { calculateSnapBounds } from '@/utils/layoutMath';

interface StarterPackConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  permission?: FeaturePermission;
  onSave?: (updates: Partial<FeaturePermission>) => void;
}

const appId =
  String(import.meta.env.VITE_FIREBASE_APP_ID ?? '') ||
  String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '') ||
  'spart-board';

const ICON_OPTIONS = [
  'Wand2',
  'BookOpen',
  'Clock',
  'Star',
  'Pencil',
  'Music',
  'Users',
  'Calculator',
  'Globe',
  'FlaskConical',
  'Palette',
  'Trophy',
  'Heart',
  'Zap',
  'BarChart2',
  'Calendar',
  'Timer',
  'CheckSquare',
  'Layers',
  'Lightbulb',
  'Apple',
  'Backpack',
  'Bell',
  'Brain',
  'Brush',
  'Bus',
  'Clipboard',
  'Coffee',
  'Compass',
  'Dna',
  'Eraser',
  'GraduationCap',
  'Languages',
  'Library',
  'Magnet',
  'Map',
  'Microscope',
  'Monitor',
  'Mountain',
  'Notebook',
  'Paintbrush',
  'Paperclip',
  'Presentation',
  'Puzzle',
  'Rocket',
  'Ruler',
  'School',
  'Search',
  'Settings',
  'Shapes',
  'Smile',
  'Target',
  'TestTube',
  'Thermometer',
  'Trees',
];

const COLOR_MAP: Record<string, string> = {
  slate: '#64748b',
  gray: '#6b7280',
  zinc: '#71717a',
  neutral: '#737373',
  stone: '#78716c',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  pink: '#ec4899',
  rose: '#f43f5e',
};

const COLOR_OPTIONS = Object.entries(COLOR_MAP).map(([value]) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

// Widgets that shouldn't be added to starter packs individually
const EXCLUDED_WIDGET_TYPES: WidgetType[] = ['starter-pack'];

const ADDABLE_TOOLS = TOOLS.filter(
  (t) => !EXCLUDED_WIDGET_TYPES.includes(t.type as WidgetType)
);

type PackWidgetEntry = Omit<WidgetData, 'id'>;

interface PackFormData {
  name: string;
  description: string;
  icon: string;
  color: string;
  gradeLevels: string[];
  isLocked: boolean;
  widgets: PackWidgetEntry[];
}

const INITIAL_FORM: PackFormData = {
  name: '',
  description: '',
  icon: 'Wand2',
  color: 'indigo',
  gradeLevels: [...ALL_GRADE_LEVELS],
  isLocked: true,
  widgets: [],
};

const LAYOUT_NAMES: Record<string, string> = {
  splitScreen: 'Split Screen',
  fourGrid: '2×2 Grid',
  nineGrid: '3×3 Grid',
  topPriority3: 'Top + 3 Bottom',
  bottomPriority3: '3 Top + Bottom',
  middlePriority3: 'Sandwich',
  sidebarLeft: 'Sidebar Left',
  sidebarRight: 'Sidebar Right',
  threeColumns: '3 Columns',
  topBottom: 'Top / Bottom',
  threeRows: '3 Rows',
  priorityLeft: 'Priority Left',
  priorityRight: 'Priority Right',
};

interface SnapZonePickerProps {
  selectedKey: string | null;
  onSelect: (
    key: string,
    bounds: { x: number; y: number; w: number; h: number }
  ) => void;
}

const SnapZonePicker: React.FC<SnapZonePickerProps> = ({
  selectedKey,
  onSelect,
}) => {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 p-3 bg-slate-50 rounded-xl border border-slate-200">
      {SNAP_LAYOUTS.map((layout) => (
        <div key={layout.id} className="group">
          <div
            className="relative w-full bg-white rounded border border-slate-200 group-hover:border-indigo-300 overflow-hidden transition-colors"
            style={{ paddingBottom: '56.25%' }}
            title={LAYOUT_NAMES[layout.nameKey] ?? layout.nameKey}
          >
            <div className="absolute inset-0">
              {layout.zones.map((zone) => {
                const key = `${layout.id}:${zone.id}`;
                const isSelected = selectedKey === key;
                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => {
                      const bounds = calculateSnapBounds(zone);
                      onSelect(key, bounds);
                    }}
                    className={`absolute transition-colors rounded-[1px] border border-white/60 ${
                      isSelected
                        ? 'bg-indigo-500'
                        : 'bg-slate-300 hover:bg-indigo-400'
                    }`}
                    style={{
                      left: `${zone.x * 100}%`,
                      top: `${zone.y * 100}%`,
                      width: `${zone.w * 100}%`,
                      height: `${zone.h * 100}%`,
                    }}
                    title={`${LAYOUT_NAMES[layout.nameKey] ?? layout.nameKey}: ${zone.id}`}
                    aria-label={`${LAYOUT_NAMES[layout.nameKey] ?? layout.nameKey}: zone ${zone.id}`}
                    aria-pressed={isSelected}
                  />
                );
              })}
            </div>
          </div>
          <p
            className="text-center text-slate-400 mt-0.5 truncate"
            style={{ fontSize: '9px' }}
          >
            {LAYOUT_NAMES[layout.nameKey] ?? layout.nameKey}
          </p>
        </div>
      ))}
    </div>
  );
};

export const StarterPackConfigurationModal: React.FC<
  StarterPackConfigurationModalProps
> = ({ isOpen, onClose, permission, onSave }) => {
  const { activeDashboard } = useDashboard();
  const { showConfirm } = useDialog();

  const [globalConfig, setGlobalConfig] = useState<StarterPackGlobalConfig>({});
  const [packs, setPacks] = useState<StarterPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // View: 'list' shows all packs, 'editor' shows the pack form
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PackFormData>(INITIAL_FORM);

  // UI state for collapses/pickers
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showManualPositioning, setShowManualPositioning] = useState(false);
  const [showWidgetManualPositioning, setShowWidgetManualPositioning] =
    useState<Record<number, boolean>>({});

  // Widget builder state
  const [newWidgetType, setNewWidgetType] = useState<WidgetType>(
    ADDABLE_TOOLS[0]?.type as WidgetType
  );
  const [newWidgetX, setNewWidgetX] = useState(100);
  const [newWidgetY, setNewWidgetY] = useState(100);
  const [newWidgetW, setNewWidgetW] = useState(300);
  const [newWidgetH, setNewWidgetH] = useState(200);

  // Snap layout picker state
  const [newWidgetSnapKey, setNewWidgetSnapKey] = useState<string | null>(null);
  const [snappingWidgetIndex, setSnappingWidgetIndex] = useState<number | null>(
    null
  );
  const [widgetSnapKeys, setWidgetSnapKeys] = useState<Record<number, string>>(
    {}
  );

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  useEffect(() => {
    if (isOpen && permission?.config) {
      setGlobalConfig(permission.config as unknown as StarterPackGlobalConfig);
    }
  }, [isOpen, permission?.config]);

  const resetSnapState = useCallback(() => {
    setSnappingWidgetIndex(null);
    setWidgetSnapKeys({});
    setNewWidgetSnapKey(null);
  }, []);

  const handleBack = useCallback(async () => {
    if (formData.name || formData.description || formData.widgets.length > 0) {
      const confirmed = await showConfirm(
        'Discard unsaved changes to this pack?',
        {
          title: 'Discard Changes',
          variant: 'warning',
          confirmLabel: 'Discard',
        }
      );
      if (!confirmed) return;
    }
    setView('list');
    setEditingId(null);
    setFormData(INITIAL_FORM);
    resetSnapState();
  }, [
    formData.name,
    formData.description,
    formData.widgets.length,
    resetSnapState,
    showConfirm,
  ]);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        void handleBack();
      }
    };
    // Use capture phase so Escape is intercepted before other global handlers
    window.addEventListener('keydown', onEscape, { capture: true });
    return () =>
      window.removeEventListener('keydown', onEscape, { capture: true });
  }, [handleBack]);

  useEffect(() => {
    if (!isOpen) return;
    if (isAuthBypass) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    const publicRef = collection(
      db,
      'artifacts',
      appId,
      'public',
      'data',
      'starterPacks'
    );
    const unsub = onSnapshot(query(publicRef), (snapshot) => {
      const loaded: StarterPack[] = [];
      snapshot.forEach((docSnap) =>
        loaded.push({ ...docSnap.data(), id: docSnap.id } as StarterPack)
      );
      setPacks(loaded);
      setLoading(false);
    });

    return () => unsub();
  }, [isOpen]);

  // When a widget type is selected, auto-fill defaults
  const handleWidgetTypeChange = useCallback((type: WidgetType) => {
    setNewWidgetType(type);
    const defaults = WIDGET_DEFAULTS[type];
    if (defaults) {
      setNewWidgetW(defaults.w ?? 300);
      setNewWidgetH(defaults.h ?? 200);
    }
    setNewWidgetSnapKey(null);
  }, []);

  const handleCaptureBoard = () => {
    const widgets = activeDashboard?.widgets ?? [];
    if (widgets.length === 0) {
      showMessage('error', 'No widgets on the current board to capture.');
      return;
    }
    const snapshot = createBoardSnapshot(
      widgets.filter((w) => w.type !== 'starter-pack')
    );
    setFormData((prev) => ({ ...prev, widgets: snapshot }));
    showMessage(
      'success',
      `Captured ${snapshot.length} widget${snapshot.length === 1 ? '' : 's'} from the current board.`
    );
  };

  const handleAddWidget = () => {
    const defaults = WIDGET_DEFAULTS[newWidgetType];
    const newEntry: PackWidgetEntry = {
      type: newWidgetType,
      x: newWidgetX,
      y: newWidgetY,
      w: newWidgetW,
      h: newWidgetH,
      z: formData.widgets.length + 1,
      flipped: false,
      minimized: false,
      config: structuredClone((defaults?.config as object) ?? {}),
    };
    setFormData((prev) => ({
      ...prev,
      widgets: [...prev.widgets, newEntry],
    }));
  };

  const handleRemoveWidget = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((_, i) => i !== index),
    }));
    setSnappingWidgetIndex(null);
    setWidgetSnapKeys((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const n = Number(k);
        if (n < index) next[n] = v;
        else if (n > index) next[n - 1] = v;
      });
      return next;
    });
  };

  const handleUpdateWidget = (
    index: number,
    field: 'x' | 'y' | 'w' | 'h',
    value: number
  ) => {
    setFormData((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w, i) =>
        i === index ? { ...w, [field]: value } : w
      ),
    }));
  };

  const handleEdit = (pack: StarterPack) => {
    setEditingId(pack.id);
    setFormData({
      name: pack.name,
      description: pack.description ?? '',
      icon: pack.icon,
      color: pack.color,
      gradeLevels: [...pack.gradeLevels],
      isLocked: pack.isLocked,
      widgets: pack.widgets as PackWidgetEntry[],
    });
    resetSnapState();
    setView('editor');
  };

  const handleNewPack = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
    resetSnapState();
    setView('editor');
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showMessage('error', 'Pack name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...formData };
      if (editingId) {
        const docRef = doc(
          db,
          'artifacts',
          appId,
          'public',
          'data',
          'starterPacks',
          editingId
        );
        await updateDoc(docRef, payload);
        showMessage('success', 'Starter pack updated.');
      } else {
        const publicRef = collection(
          db,
          'artifacts',
          appId,
          'public',
          'data',
          'starterPacks'
        );
        await addDoc(publicRef, payload);
        showMessage('success', 'Starter pack created.');
      }
      setView('list');
      setEditingId(null);
      setFormData(INITIAL_FORM);
      resetSnapState();
    } catch (err) {
      console.error('Error saving pack:', err);
      showMessage('error', 'Failed to save starter pack.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm(
      'Are you sure you want to delete this Starter Pack? This cannot be undone.',
      {
        title: 'Delete Starter Pack',
        variant: 'danger',
      }
    );
    if (!confirmed) return;
    try {
      await deleteDoc(
        doc(db, 'artifacts', appId, 'public', 'data', 'starterPacks', id)
      );
    } catch (err) {
      console.error('Error deleting pack:', err);
      showMessage('error', 'Failed to delete starter pack.');
    }
  };

  const PreviewIcon =
    (LucideIcons as unknown as Record<string, LucideIcon>)[formData.icon] ??
    LucideIcons.Wand2;

  if (!isOpen) return null;

  const header = (
    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
      <div className="flex items-center gap-3">
        {view === 'editor' && (
          <button
            onClick={() => void handleBack()}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="bg-indigo-500 p-2 rounded-xl text-white">
          <Package className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            {view === 'list'
              ? 'Starter Packs Administration'
              : editingId
                ? 'Edit Starter Pack'
                : 'New Starter Pack'}
          </h2>
          <p className="text-xs text-slate-500">
            {view === 'list'
              ? 'Manage building-wide starter packs available to all teachers'
              : 'Configure pack metadata and widget layout'}
          </p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  const footer =
    view === 'editor' ? (
      <div className="flex items-center justify-between w-full">
        <button
          onClick={() => void handleBack()}
          className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !formData.name.trim() || isAuthBypass}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Pack'}
        </button>
      </div>
    ) : undefined;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="max-w-5xl"
        customHeader={header}
        footer={footer}
        className="!p-0 !bg-slate-50"
        contentClassName="bg-slate-50"
        footerClassName="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between w-full shrink-0"
      >
        {view === 'list' ? (
          /* ── Pack List ── */
          <div className="p-6 space-y-6">
            {onSave && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4 mb-2">
                <DockDefaultsPanel
                  config={{ dockDefaults: globalConfig.dockDefaults ?? {} }}
                  onChange={(d) =>
                    setGlobalConfig((prev) => ({ ...prev, dockDefaults: d }))
                  }
                />
                <div className="flex justify-end border-t border-slate-50 pt-3">
                  <button
                    onClick={() => {
                      onSave({
                        config: globalConfig as unknown as Record<
                          string,
                          unknown
                        >,
                      });
                      showMessage('success', 'Dock defaults saved');
                    }}
                    className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Dock Defaults
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                {loading
                  ? 'Loading...'
                  : `${packs.length} pack${packs.length === 1 ? '' : 's'} available building-wide`}
              </p>
              <button
                onClick={handleNewPack}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Pack
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading packs...
              </div>
            ) : packs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center gap-3">
                <Wand2 className="w-10 h-10 opacity-40" />
                <p className="font-medium">No building-wide packs yet.</p>
                <p className="text-sm">
                  Create one to give teachers instant workspace setups.
                </p>
                <button
                  onClick={handleNewPack}
                  className="mt-2 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create First Pack
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                {packs.map((pack) => {
                  const PackIcon =
                    (LucideIcons as unknown as Record<string, LucideIcon>)[
                      pack.icon
                    ] ?? LucideIcons.Wand2;
                  return (
                    <div
                      key={pack.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 hover:border-indigo-200 transition-colors"
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: COLOR_MAP[pack.color] + '20',
                          color: COLOR_MAP[pack.color],
                        }}
                      >
                        <PackIcon className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-slate-800">
                            {pack.name}
                          </h4>
                          {pack.isLocked && (
                            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 font-medium">
                              Locked
                            </span>
                          )}
                        </div>
                        {pack.description && (
                          <p className="text-sm text-slate-500 truncate">
                            {pack.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <LayoutGrid className="w-3 h-3" />
                            {pack.widgets.length} widget
                            {pack.widgets.length === 1 ? '' : 's'}
                          </span>
                          {pack.gradeLevels.map((level) => (
                            <span
                              key={level}
                              className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100 font-medium"
                            >
                              {level.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleEdit(pack)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit pack"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void handleDelete(pack.id)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete pack"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ── Pack Editor ── */
          <div className="p-6 space-y-6">
            {/* Metadata */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">
                Pack Details
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-sm font-semibold text-slate-600 block mb-1.5">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="e.g. Reading Workshop"
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors text-sm"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="text-sm font-semibold text-slate-600 block mb-1.5">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Brief description of the pack"
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors text-sm"
                  />
                </div>
              </div>

              {/* Icon & Color */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Icon Selection */}
                <div>
                  <label className="text-sm font-semibold text-slate-600 block mb-2">
                    Icon
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowIconPicker(!showIconPicker)}
                      className="flex items-center gap-3 px-3 py-2 border-2 border-slate-200 rounded-xl hover:border-indigo-500 transition-colors bg-white w-full sm:w-auto"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                        style={{
                          backgroundColor: COLOR_MAP[formData.color] + '20', // 12.5% opacity
                          color: COLOR_MAP[formData.color],
                        }}
                      >
                        <PreviewIcon className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">
                        {formData.icon}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-400 ml-auto" />
                    </button>

                    {showIconPicker && (
                      <div className="absolute top-full left-0 mt-2 p-3 bg-white rounded-2xl shadow-xl border border-slate-200 z-popover w-full sm:w-[320px]">
                        <div className="grid grid-cols-6 gap-2 max-h-[240px] overflow-y-auto p-1 custom-scrollbar">
                          {ICON_OPTIONS.map((name) => {
                            const IconComp = (
                              LucideIcons as unknown as Record<
                                string,
                                LucideIcon
                              >
                            )[name];
                            if (!IconComp) return null;
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => {
                                  setFormData((p) => ({ ...p, icon: name }));
                                  setShowIconPicker(false);
                                }}
                                className={`p-2 rounded-lg flex items-center justify-center transition-colors ${
                                  formData.icon === name
                                    ? 'bg-indigo-100 text-indigo-600'
                                    : 'text-slate-500 hover:bg-slate-100'
                                }`}
                                title={name}
                              >
                                <IconComp className="w-5 h-5" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Color Selection */}
                <div>
                  <label className="text-sm font-semibold text-slate-600 block mb-2">
                    Brand Color
                  </label>
                  <div className="grid grid-cols-11 gap-1.5 p-1 bg-slate-50 rounded-xl border border-slate-200">
                    {COLOR_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setFormData((p) => ({ ...p, color: value }))
                        }
                        className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
                          formData.color === value
                            ? 'border-slate-800 scale-110 shadow-sm'
                            : 'border-transparent hover:scale-110'
                        }`}
                        style={{
                          backgroundColor: COLOR_MAP[value],
                        }}
                        title={label}
                      >
                        {formData.color === value && (
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Grade Levels */}
              <div>
                <label className="text-sm font-semibold text-slate-600 block mb-2">
                  Grade Levels
                </label>
                <div className="flex gap-2 flex-wrap">
                  {ALL_GRADE_LEVELS.map((level) => {
                    const selected = formData.gradeLevels.includes(level);
                    return (
                      <button
                        key={level}
                        onClick={() => {
                          const current = formData.gradeLevels;
                          setFormData((p) => ({
                            ...p,
                            gradeLevels: selected
                              ? current.filter((l) => l !== level)
                              : [...current, level],
                          }));
                        }}
                        className={`px-3 py-1 text-xs font-bold rounded-full border-2 transition-all ${
                          selected
                            ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        {level.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Locked toggle */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    Lock Pack
                  </p>
                  <p className="text-xs text-slate-500">
                    Locked packs cannot be edited or deleted by teachers
                  </p>
                </div>
                <button
                  onClick={() =>
                    setFormData((p) => ({ ...p, isLocked: !p.isLocked }))
                  }
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    formData.isLocked ? 'bg-brand-blue-primary' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      formData.isLocked ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </section>

            {/* Widget Layout */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">
                    Widget Layout
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formData.widgets.length} widget
                    {formData.widgets.length === 1 ? '' : 's'} in this pack
                  </p>
                </div>
                <button
                  onClick={handleCaptureBoard}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors"
                  title="Capture all widgets from your current board (positions and sizes included)"
                >
                  <Camera className="w-4 h-4" />
                  Capture Current Board
                </button>
              </div>

              {/* Existing widgets */}
              {formData.widgets.length > 0 ? (
                <div className="space-y-2">
                  {formData.widgets.map((widget, index) => {
                    const toolMeta = TOOLS.find((t) => t.type === widget.type);
                    const WidgetIcon = toolMeta?.icon ?? Package;
                    const isSnapOpen = snappingWidgetIndex === index;
                    return (
                      <div
                        key={index}
                        className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden"
                      >
                        <div className="flex items-center gap-3 p-3">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ${toolMeta?.color ?? 'bg-slate-400'}`}
                          >
                            <WidgetIcon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-700 truncate">
                              {toolMeta?.label ?? widget.type}
                            </p>
                            {showWidgetManualPositioning[index] && (
                              <div className="flex gap-3 mt-1 flex-wrap animate-in fade-in slide-in-from-top-1 duration-200">
                                {(
                                  [
                                    ['x', 'X'],
                                    ['y', 'Y'],
                                    ['w', 'W'],
                                    ['h', 'H'],
                                  ] as [
                                    keyof typeof widget &
                                      ('x' | 'y' | 'w' | 'h'),
                                    string,
                                  ][]
                                ).map(([field, label]) => (
                                  <label
                                    key={field}
                                    className="flex items-center gap-1 text-xs text-slate-500"
                                  >
                                    <span className="font-bold text-slate-400 uppercase">
                                      {label}
                                    </span>
                                    <input
                                      type="number"
                                      value={widget[field]}
                                      onChange={(e) => {
                                        const next =
                                          e.currentTarget.valueAsNumber;
                                        if (!Number.isFinite(next)) return;
                                        handleUpdateWidget(index, field, next);
                                        setWidgetSnapKeys((prev) => {
                                          if (!prev[index]) return prev;
                                          const { [index]: _, ...rest } = prev;
                                          return rest;
                                        });
                                      }}
                                      className="w-16 px-1.5 py-0.5 border border-slate-200 rounded-md text-xs text-center focus:border-indigo-400 focus:outline-none"
                                    />
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() =>
                              setShowWidgetManualPositioning((prev) => ({
                                ...prev,
                                [index]: !prev[index],
                              }))
                            }
                            className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                              showWidgetManualPositioning[index]
                                ? 'bg-slate-200 text-slate-700'
                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                            }`}
                            title="Toggle manual coordinates"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              setSnappingWidgetIndex(isSnapOpen ? null : index)
                            }
                            className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                              isSnapOpen
                                ? 'bg-indigo-100 text-indigo-600'
                                : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                            }`}
                            title="Snap to layout position"
                            aria-label="Snap to layout position"
                            aria-expanded={isSnapOpen}
                          >
                            <LayoutTemplate className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveWidget(index)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {isSnapOpen && (
                          <div className="px-3 pb-3 border-t border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-2 mb-1.5">
                              Snap to Layout Position
                            </p>
                            <SnapZonePicker
                              selectedKey={widgetSnapKeys[index] ?? null}
                              onSelect={(key, bounds) => {
                                setFormData((prev) => ({
                                  ...prev,
                                  widgets: prev.widgets.map((w, i) =>
                                    i === index ? { ...w, ...bounds } : w
                                  ),
                                }));
                                setWidgetSnapKeys((prev) => ({
                                  ...prev,
                                  [index]: key,
                                }));
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-center gap-2 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                  <LayoutGrid className="w-8 h-8 opacity-40" />
                  <p className="text-sm font-medium">No widgets yet</p>
                  <p className="text-xs">
                    Capture your current board or add widgets individually below
                  </p>
                </div>
              )}

              {/* Add individual widget */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Add New Widget
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setShowManualPositioning(!showManualPositioning)
                    }
                    className={`text-xxs font-black uppercase tracking-widest px-2 py-1 rounded-md transition-colors ${
                      showManualPositioning
                        ? 'bg-slate-200 text-slate-600'
                        : 'bg-slate-100 text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {showManualPositioning ? 'Hide Manual' : 'Show Manual'}
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">
                        Widget Type
                      </label>
                      <select
                        value={newWidgetType}
                        onChange={(e) =>
                          handleWidgetTypeChange(e.target.value as WidgetType)
                        }
                        className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors text-sm"
                      >
                        {ADDABLE_TOOLS.map((t) => (
                          <option key={t.type} value={t.type}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={handleAddWidget}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors h-[42px]"
                    >
                      <Plus className="w-4 h-4" />
                      Add to Pack
                    </button>
                  </div>

                  {showManualPositioning && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      {(
                        [
                          ['X', newWidgetX, setNewWidgetX],
                          ['Y', newWidgetY, setNewWidgetY],
                          ['W', newWidgetW, setNewWidgetW],
                          ['H', newWidgetH, setNewWidgetH],
                        ] as [
                          string,
                          number,
                          React.Dispatch<React.SetStateAction<number>>,
                        ][]
                      ).map(([label, val, setter]) => (
                        <div key={label}>
                          <label className="text-xxs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            {label === 'X' || label === 'Y'
                              ? `${label} Position`
                              : label === 'W'
                                ? 'Width'
                                : 'Height'}
                          </label>
                          <input
                            type="number"
                            value={val}
                            onChange={(e) => {
                              const next = e.currentTarget.valueAsNumber;
                              if (!Number.isFinite(next)) return;
                              setter(next);
                              setNewWidgetSnapKey(null);
                            }}
                            className="w-full px-3 py-1.5 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Snap to Layout Position picker - Always open for new widgets as it is priority */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-widest mb-3">
                      <LayoutTemplate className="w-3.5 h-3.5" />
                      Snap to Layout Position
                      {newWidgetSnapKey && (
                        <span className="ml-1 normal-case font-normal text-indigo-500 tracking-normal">
                          — position selected
                        </span>
                      )}
                    </div>
                    <SnapZonePicker
                      selectedKey={newWidgetSnapKey}
                      onSelect={(key, bounds) => {
                        setNewWidgetX(bounds.x);
                        setNewWidgetY(bounds.y);
                        setNewWidgetW(bounds.w);
                        setNewWidgetH(bounds.h);
                        setNewWidgetSnapKey(key);
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </Modal>

      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}
    </>
  );
};

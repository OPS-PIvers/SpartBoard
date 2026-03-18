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
import { StarterPack, WidgetType, WidgetData } from '@/types';
import { ALL_GRADE_LEVELS } from '@/config/widgetGradeLevels';
import { TOOLS } from '@/config/tools';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { useDashboard } from '@/context/useDashboard';
import { createBoardSnapshot } from '@/utils/widgetHelpers';
import { Toast } from '@/components/common/Toast';
import { useDialog } from '@/context/useDialog';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StarterPackConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
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
];

const COLOR_OPTIONS = [
  { value: 'indigo', label: 'Indigo' },
  { value: 'blue', label: 'Blue' },
  { value: 'violet', label: 'Violet' },
  { value: 'emerald', label: 'Emerald' },
  { value: 'teal', label: 'Teal' },
  { value: 'amber', label: 'Amber' },
  { value: 'rose', label: 'Rose' },
  { value: 'orange', label: 'Orange' },
  { value: 'sky', label: 'Sky' },
  { value: 'pink', label: 'Pink' },
];

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

export const StarterPackConfigurationModal: React.FC<
  StarterPackConfigurationModalProps
> = ({ isOpen, onClose }) => {
  const { activeDashboard } = useDashboard();
  const { showConfirm } = useDialog();

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

  // Widget builder state
  const [newWidgetType, setNewWidgetType] = useState<WidgetType>(
    ADDABLE_TOOLS[0]?.type as WidgetType
  );
  const [newWidgetX, setNewWidgetX] = useState(100);
  const [newWidgetY, setNewWidgetY] = useState(100);
  const [newWidgetW, setNewWidgetW] = useState(300);
  const [newWidgetH, setNewWidgetH] = useState(200);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

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
  }, [
    formData.name,
    formData.description,
    formData.widgets.length,
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
    setView('editor');
  };

  const handleNewPack = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
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

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {view === 'list' ? (
            /* ── Pack List ── */
            <div className="p-6 space-y-4">
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
                            backgroundColor: `var(--color-${pack.color}-100, #e0e7ff)`,
                            color: `var(--color-${pack.color}-600, #4f46e5)`,
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

                {/* Icon */}
                <div>
                  <label className="text-sm font-semibold text-slate-600 block mb-2">
                    Icon
                  </label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `var(--color-${formData.color}-100, #e0e7ff)`,
                        color: `var(--color-${formData.color}-600, #4f46e5)`,
                      }}
                    >
                      <PreviewIcon className="w-5 h-5" />
                    </div>
                    <select
                      value={formData.icon}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, icon: e.target.value }))
                      }
                      className="px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors text-sm"
                    >
                      {ICON_OPTIONS.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Color */}
                <div>
                  <label className="text-sm font-semibold text-slate-600 block mb-2">
                    Color
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() =>
                          setFormData((p) => ({ ...p, color: value }))
                        }
                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border-2 transition-all ${
                          formData.color === value
                            ? 'border-slate-800 shadow-sm'
                            : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        style={
                          formData.color === value
                            ? {
                                backgroundColor: `var(--color-${value}-100, #e0e7ff)`,
                                color: `var(--color-${value}-700, #3730a3)`,
                              }
                            : {}
                        }
                      >
                        {label}
                      </button>
                    ))}
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
                      formData.isLocked
                        ? 'bg-brand-blue-primary'
                        : 'bg-slate-200'
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
                      const toolMeta = TOOLS.find(
                        (t) => t.type === widget.type
                      );
                      const WidgetIcon = toolMeta?.icon ?? Package;
                      return (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200"
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ${toolMeta?.color ?? 'bg-slate-400'}`}
                          >
                            <WidgetIcon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-700 truncate">
                              {toolMeta?.label ?? widget.type}
                            </p>
                            <div className="flex gap-3 mt-1 flex-wrap">
                              {(
                                [
                                  ['x', 'X'],
                                  ['y', 'Y'],
                                  ['w', 'W'],
                                  ['h', 'H'],
                                ] as [
                                  keyof typeof widget & ('x' | 'y' | 'w' | 'h'),
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
                                    onChange={(e) =>
                                      handleUpdateWidget(
                                        index,
                                        field,
                                        Number(e.target.value)
                                      )
                                    }
                                    className="w-16 px-1.5 py-0.5 border border-slate-200 rounded-md text-xs text-center focus:border-indigo-400 focus:outline-none"
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveWidget(index)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-center gap-2 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                    <LayoutGrid className="w-8 h-8 opacity-40" />
                    <p className="text-sm font-medium">No widgets yet</p>
                    <p className="text-xs">
                      Capture your current board or add widgets individually
                      below
                    </p>
                  </div>
                )}

                {/* Add individual widget */}
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Add Widget Manually
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
                    <div className="col-span-2 sm:col-span-1">
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
                        <label className="text-xs font-semibold text-slate-600 block mb-1">
                          {label === 'X' || label === 'Y'
                            ? `${label} Position`
                            : label === 'W'
                              ? 'Width'
                              : 'Height'}
                        </label>
                        <input
                          type="number"
                          value={val}
                          onChange={(e) => setter(Number(e.target.value))}
                          className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors text-sm"
                        />
                      </div>
                    ))}

                    <div className="col-span-2 sm:col-span-1">
                      <button
                        onClick={handleAddWidget}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Add Widget
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        {view === 'editor' && (
          <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between shrink-0">
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
              {saving
                ? 'Saving...'
                : editingId
                  ? 'Save Changes'
                  : 'Create Pack'}
            </button>
          </div>
        )}
      </div>

      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}
    </div>
  );
};

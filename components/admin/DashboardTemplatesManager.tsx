import React, { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import {
  DashboardTemplate,
  GlobalStyle,
  GradeLevel,
  WidgetData,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { Toggle } from '@/components/common/Toggle';
import { BUILDINGS } from '@/config/buildings';
import {
  Plus,
  Trash2,
  LayoutTemplate,
  Loader2,
  Globe,
  Eye,
  EyeOff,
  BookOpen,
  Save,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react';

const GRADE_LEVELS: { id: GradeLevel; label: string }[] = [
  { id: 'k-2', label: 'K–2' },
  { id: '3-5', label: '3–5' },
  { id: '6-8', label: '6–8' },
  { id: '9-12', label: '9–12' },
];

const TEMPLATES_COLLECTION = 'dashboard_templates';

interface TemplateFormState {
  name: string;
  description: string;
  tags: string;
  targetGradeLevels: GradeLevel[];
  targetBuildings: string[];
  isPublished: boolean;
  captureCurrentBoard: boolean;
}

const DEFAULT_FORM: TemplateFormState = {
  name: '',
  description: '',
  tags: '',
  targetGradeLevels: [],
  targetBuildings: [],
  isPublished: true,
  captureCurrentBoard: true,
};

export const DashboardTemplatesManager: React.FC = () => {
  const { user } = useAuth();
  const {
    activeDashboard,
    addWidget,
    setGlobalStyle,
    setBackground,
    addToast,
  } = useDashboard();
  const { showConfirm } = useDialog();

  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TemplateFormState>(DEFAULT_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // Subscribe to templates collection
  useEffect(() => {
    if (isAuthBypass) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, TEMPLATES_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTemplates(
          snap.docs.map((d) => ({
            ...(d.data() as DashboardTemplate),
            id: d.id,
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load dashboard templates:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const handleSave = useCallback(async () => {
    if (isAuthBypass || !form.name.trim() || !user?.email) return;

    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const now = Date.now();

      // Only capture board content when the checkbox is checked
      let widgets: WidgetData[] = [];
      let capturedStyle: Partial<GlobalStyle> | undefined;
      let capturedBackground: string | undefined;
      if (form.captureCurrentBoard && activeDashboard) {
        // Strip locked state so templates start unlocked when applied
        widgets = activeDashboard.widgets.map((w) => ({
          ...w,
          isLocked: undefined,
        }));
        capturedStyle = activeDashboard.globalStyle;
        capturedBackground = activeDashboard.background;
      }

      const template: DashboardTemplate = {
        id,
        name: form.name.trim(),
        description: form.description.trim(),
        widgets,
        // Only persist style/background when the board was captured — leave them
        // undefined otherwise so applying the template is non-destructive.
        globalStyle: capturedStyle,
        background: capturedBackground,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        targetGradeLevels: form.targetGradeLevels,
        targetBuildings: form.targetBuildings,
        isPublished: form.isPublished,
        createdAt: now,
        updatedAt: now,
        createdBy: user.email,
      };

      await setDoc(doc(db, TEMPLATES_COLLECTION, id), template);
      setForm(DEFAULT_FORM);
      setShowForm(false);
    } catch (err) {
      console.error('Failed to save template:', err);
      addToast('Failed to save template. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }, [form, user, activeDashboard, addToast]);

  const handleTogglePublished = useCallback(
    async (template: DashboardTemplate) => {
      try {
        await setDoc(
          doc(db, TEMPLATES_COLLECTION, template.id),
          { isPublished: !template.isPublished, updatedAt: Date.now() },
          { merge: true }
        );
      } catch (err) {
        console.error('Failed to update template:', err);
        addToast('Failed to update template. Please try again.', 'error');
      }
    },
    [addToast]
  );

  const handleDelete = useCallback(
    async (template: DashboardTemplate) => {
      const confirmed = await showConfirm(
        `Delete template "${template.name}"? This cannot be undone.`,
        { title: 'Delete Template', variant: 'danger', confirmLabel: 'Delete' }
      );
      if (confirmed) {
        try {
          await deleteDoc(doc(db, TEMPLATES_COLLECTION, template.id));
        } catch (err) {
          console.error('Failed to delete template:', err);
          addToast('Failed to delete template. Please try again.', 'error');
        }
      }
    },
    [showConfirm, addToast]
  );

  const handleApply = useCallback(
    async (template: DashboardTemplate) => {
      if (!activeDashboard) return;
      const confirmed = await showConfirm(
        `Apply "${template.name}" to your current board? This will add all template widgets at their default positions.`,
        { title: 'Apply Template', confirmLabel: 'Apply' }
      );
      if (!confirmed) return;

      setApplyingId(template.id);
      try {
        // Apply style and background captured by the template
        if (template.globalStyle) {
          setGlobalStyle(template.globalStyle);
        }
        if (template.background) {
          setBackground(template.background);
        }
        for (const widget of template.widgets) {
          // Omit identity/ordering/lock fields — addWidget assigns a new id and z.
          // Deep-clone config to prevent shared references across widget instances.
          const {
            id: _id,
            z: _z,
            isLocked: _isLocked,
            config,
            ...rest
          } = widget;
          addWidget(widget.type, {
            ...rest,
            config: structuredClone(config),
            // Offset so new widgets don't exactly overlap any existing ones
            x: widget.x + 20,
            y: widget.y + 20,
          });
        }
      } finally {
        setApplyingId(null);
      }
    },
    [activeDashboard, addWidget, setGlobalStyle, setBackground, showConfirm]
  );

  const toggleGradeLevel = (level: GradeLevel) => {
    setForm((prev) => ({
      ...prev,
      targetGradeLevels: prev.targetGradeLevels.includes(level)
        ? prev.targetGradeLevels.filter((l) => l !== level)
        : [...prev.targetGradeLevels, level],
    }));
  };

  const toggleBuilding = (id: string) => {
    setForm((prev) => ({
      ...prev,
      targetBuildings: prev.targetBuildings.includes(id)
        ? prev.targetBuildings.filter((b) => b !== id)
        : [...prev.targetBuildings, id],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            Dashboard Templates
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Create reusable dashboard layouts that can be applied to any board.
            Templates capture the current board&apos;s widgets and style.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-blue-primary text-white rounded-xl font-bold text-sm hover:bg-brand-blue-dark transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm animate-in slide-in-from-top-2 duration-200">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-brand-blue-primary" />
            Create New Template
          </h3>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
              Template Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. K-2 Morning Routine"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="What is this template for?"
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1">
            <label className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="morning, math, literacy"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
            />
          </div>

          {/* Grade Levels */}
          <div className="space-y-2">
            <label className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
              Target Grade Levels (empty = all)
            </label>
            <div className="flex gap-2 flex-wrap">
              {GRADE_LEVELS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => toggleGradeLevel(g.id)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    form.targetGradeLevels.includes(g.id)
                      ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-brand-blue-primary'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Buildings */}
          {BUILDINGS.length > 0 && (
            <div className="space-y-2">
              <label className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
                Target Buildings (empty = all buildings)
              </label>
              <div className="flex gap-2 flex-wrap max-h-28 overflow-y-auto">
                {BUILDINGS.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => toggleBuilding(b.id)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                      form.targetBuildings.includes(b.id)
                        ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-brand-blue-primary'
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Capture Board Checkbox */}
          <div className="flex items-center gap-3">
            <Toggle
              checked={form.captureCurrentBoard}
              onChange={(checked) =>
                setForm({ ...form, captureCurrentBoard: checked })
              }
            />
            <span className="text-sm text-slate-700 font-medium">
              Capture current board widgets &amp; style
            </span>
          </div>

          {/* Published Checkbox */}
          <div className="flex items-center gap-3">
            <Toggle
              checked={form.isPublished}
              onChange={(checked) => setForm({ ...form, isPublished: checked })}
            />
            <span className="text-sm text-slate-700 font-medium">
              Publish template (visible in user Starter Pack)
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void handleSave()}
              disabled={saving || !form.name.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-brand-blue-primary text-white rounded-lg font-bold text-sm hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Template
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setForm(DEFAULT_FORM);
              }}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Templates List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading templates…</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <BookOpen className="w-10 h-10 opacity-40" />
          <p className="text-sm font-medium">No templates yet.</p>
          <p className="text-xs text-center max-w-xs">
            Create a template to save the current board layout and make it
            available to other users as a Starter Pack option.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"
            >
              {/* Template Row */}
              <div className="flex items-center gap-3 p-4">
                <div className="w-10 h-10 rounded-xl bg-brand-blue-primary/10 flex items-center justify-center shrink-0">
                  <LayoutTemplate className="w-5 h-5 text-brand-blue-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-800 text-sm truncate">
                      {template.name}
                    </h3>
                    {!template.isPublished && (
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-xxs font-bold uppercase rounded">
                        Draft
                      </span>
                    )}
                    {template.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xxs font-bold rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {template.widgets.length} widget
                    {template.widgets.length !== 1 ? 's' : ''} ·{' '}
                    {template.targetGradeLevels.length > 0
                      ? template.targetGradeLevels.join(', ')
                      : 'All grades'}{' '}
                    ·{' '}
                    {template.targetBuildings.length > 0
                      ? `${template.targetBuildings.length} building${template.targetBuildings.length !== 1 ? 's' : ''}`
                      : 'All buildings'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => void handleApply(template)}
                    disabled={applyingId === template.id}
                    title="Apply template to current board"
                    className="p-2 rounded-lg text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-primary/10 transition-colors disabled:opacity-50"
                  >
                    {applyingId === template.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    onClick={() => void handleTogglePublished(template)}
                    title={
                      template.isPublished
                        ? 'Unpublish template'
                        : 'Publish template'
                    }
                    className={`p-2 rounded-lg transition-colors ${
                      template.isPublished
                        ? 'text-green-500 hover:bg-green-50'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {template.isPublished ? (
                      <Globe className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    onClick={() =>
                      setExpandedId(
                        expandedId === template.id ? null : template.id
                      )
                    }
                    title="Show details"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {expandedId === template.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    onClick={() => void handleDelete(template)}
                    title="Delete template"
                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === template.id && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-2 animate-in slide-in-from-top-1 duration-150">
                  {template.description && (
                    <p className="text-sm text-slate-600">
                      {template.description}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500">
                    <span>
                      <strong>Created by:</strong> {template.createdBy}
                    </span>
                    <span>
                      <strong>Created:</strong>{' '}
                      {new Date(template.createdAt).toLocaleDateString()}
                    </span>
                    <span>
                      <strong>Widgets:</strong> {template.widgets.length}
                    </span>
                    <span>
                      <strong>Published:</strong>{' '}
                      {template.isPublished ? 'Yes' : 'No (draft)'}
                    </span>
                    {template.tags.length > 0 && (
                      <span className="col-span-2">
                        <strong>Tags:</strong> {template.tags.join(', ')}
                      </span>
                    )}
                  </div>

                  {/* Widget type list */}
                  {template.widgets.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {Array.from(
                        new Set(template.widgets.map((w) => w.type))
                      ).map((type) => (
                        <span
                          key={type}
                          className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 text-xxs font-mono rounded"
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Firestore rules reminder */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
        <Eye className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Templates are stored in the{' '}
          <code className="font-mono bg-amber-100 px-1 rounded">
            dashboard_templates
          </code>{' '}
          Firestore collection. Ensure your security rules allow authenticated
          users to read and admins to write this collection.
        </p>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  addDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { DashboardTemplate } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { Toggle } from '@/components/common/Toggle';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import {
  Plus,
  Trash2,
  LayoutTemplate,
  Loader2,
  Save,
  Shield,
  Globe,
  Users,
} from 'lucide-react';

type AccessLevel = 'admin' | 'beta' | 'public';

const TEMPLATES_COLLECTION = 'dashboard_templates';

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

const getAccessLevelIcon = (level: AccessLevel) => {
  switch (level) {
    case 'admin':
      return <Shield className="w-3.5 h-3.5" />;
    case 'beta':
      return <Users className="w-3.5 h-3.5" />;
    case 'public':
      return <Globe className="w-3.5 h-3.5" />;
  }
};

interface NewTemplateFormState {
  name: string;
  description: string;
}

const DEFAULT_FORM: NewTemplateFormState = { name: '', description: '' };

export const DashboardTemplatesManager: React.FC = () => {
  const { user } = useAuth();
  const { showConfirm } = useDialog();
  const BUILDINGS = useAdminBuildings();

  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Local editable copies keyed by template id
  const [localTemplates, setLocalTemplates] = useState<
    Map<string, DashboardTemplate>
  >(new Map());
  const [unsavedIds, setUnsavedIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // New template form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewTemplateFormState>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);

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
        const loaded = snap.docs.map((d) => ({
          ...(d.data() as DashboardTemplate),
          id: d.id,
        }));
        setTemplates(loaded);
        // Seed local copies for any template not already being edited
        setLocalTemplates((prev) => {
          const next = new Map(prev);
          for (const t of loaded) {
            if (!next.has(t.id)) {
              next.set(t.id, t);
            }
          }
          // Remove entries for deleted templates
          for (const key of next.keys()) {
            if (!loaded.find((t) => t.id === key)) {
              next.delete(key);
            }
          }
          return next;
        });
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load dashboard templates:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const updateLocal = useCallback(
    (id: string, updates: Partial<DashboardTemplate>) => {
      setLocalTemplates((prev) => {
        const current = prev.get(id);
        if (!current) return prev;
        return new Map(prev).set(id, { ...current, ...updates });
      });
      setUnsavedIds((prev) => new Set(prev).add(id));
    },
    []
  );

  const handleSave = useCallback(
    async (id: string) => {
      const local = localTemplates.get(id);
      if (!local) return;
      setSavingIds((prev) => new Set(prev).add(id));
      try {
        await setDoc(doc(db, TEMPLATES_COLLECTION, id), {
          ...local,
          updatedAt: Date.now(),
        });
        setUnsavedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch (err) {
        console.error('Failed to save template:', err);
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [localTemplates]
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
        }
      }
    },
    [showConfirm]
  );

  const handleCreate = useCallback(async () => {
    if (!form.name.trim() || !user?.email) return;
    setCreating(true);
    try {
      const now = Date.now();
      const newTemplate: Omit<DashboardTemplate, 'id'> = {
        name: form.name.trim(),
        description: form.description.trim(),
        widgets: [],
        tags: [],
        targetGradeLevels: [],
        targetBuildings: [],
        enabled: true,
        accessLevel: 'public',
        createdAt: now,
        updatedAt: now,
        createdBy: user.email,
      };
      await addDoc(collection(db, TEMPLATES_COLLECTION), newTemplate);
      setForm(DEFAULT_FORM);
      setShowForm(false);
    } catch (err) {
      console.error('Failed to create template:', err);
    } finally {
      setCreating(false);
    }
  }, [form, user]);

  const toggleBuilding = (id: string, buildingId: string) => {
    const local = localTemplates.get(id);
    if (!local) return;
    const next = local.targetBuildings.includes(buildingId)
      ? local.targetBuildings.filter((b) => b !== buildingId)
      : [...local.targetBuildings, buildingId];
    updateLocal(id, { targetBuildings: next });
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
            Manage templates available to users in the Boards sidebar. Use the
            &ldquo;Save as Template&rdquo; button on any board card to capture a
            board&apos;s layout.
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

      {/* Create Form (blank template shell) */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm animate-in slide-in-from-top-2 duration-200">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-brand-blue-primary" />
            Create Empty Template Shell
          </h3>
          <p className="text-xs text-slate-500">
            Creates a template with no widgets. Use the &ldquo;Save as
            Template&rdquo; button on a board card to populate it with a real
            board layout.
          </p>

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

          <div className="space-y-1">
            <label className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
              Description
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="What is this template for?"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void handleCreate()}
              disabled={creating || !form.name.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-brand-blue-primary text-white rounded-lg font-bold text-sm hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Create
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

      {/* Template Rows */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading templates…</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <LayoutTemplate className="w-10 h-10 opacity-40" />
          <p className="text-sm font-medium">No templates yet.</p>
          <p className="text-xs text-center max-w-xs">
            Create a template above, then use the &ldquo;Save as Template&rdquo;
            button on any board card to capture its layout.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => {
            const local = localTemplates.get(template.id) ?? template;
            const hasUnsaved = unsavedIds.has(template.id);
            const isSaving = savingIds.has(template.id);

            return (
              <div
                key={template.id}
                className="bg-white border-2 border-slate-200 rounded-xl hover:border-brand-blue-light transition-colors overflow-hidden"
              >
                <div className="flex items-center gap-4 p-3 flex-wrap">
                  {/* Identity */}
                  <div className="flex items-center gap-3 w-60 shrink-0 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-brand-blue-primary/10 flex items-center justify-center shrink-0">
                      <LayoutTemplate className="w-4 h-4 text-brand-blue-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={local.name}
                        onChange={(e) =>
                          updateLocal(template.id, { name: e.target.value })
                        }
                        className="w-full font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-brand-blue-primary focus:outline-none px-0 py-0.5 text-sm transition-colors"
                        placeholder="Template name"
                      />
                      <input
                        type="text"
                        value={local.description}
                        onChange={(e) =>
                          updateLocal(template.id, {
                            description: e.target.value,
                          })
                        }
                        className="w-full text-xs text-slate-500 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-brand-blue-primary focus:outline-none px-0 py-0.5 transition-colors"
                        placeholder="Add description…"
                      />
                    </div>
                  </div>

                  <div className="w-px h-8 bg-slate-100 mx-1 shrink-0" />

                  {/* Enabled toggle */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <span className="text-xxs font-bold text-slate-400 uppercase">
                      Enabled
                    </span>
                    <Toggle
                      checked={local.enabled}
                      onChange={(checked) =>
                        updateLocal(template.id, { enabled: checked })
                      }
                      size="sm"
                    />
                  </div>

                  <div className="w-px h-8 bg-slate-100 mx-1 shrink-0" />

                  {/* Access level */}
                  <div className="flex items-center gap-1">
                    {(['admin', 'beta', 'public'] as AccessLevel[]).map(
                      (level) => (
                        <button
                          key={level}
                          onClick={() =>
                            updateLocal(template.id, { accessLevel: level })
                          }
                          className={`px-2 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1 transition-all ${
                            local.accessLevel === level
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

                  {/* Building selector */}
                  {BUILDINGS.length > 0 && (
                    <>
                      <div className="w-px h-8 bg-slate-100 mx-1 shrink-0" />
                      <div className="flex items-center gap-1 flex-wrap">
                        {BUILDINGS.map((b) => {
                          const selected = local.targetBuildings.includes(b.id);
                          return (
                            <button
                              key={b.id}
                              onClick={() => toggleBuilding(template.id, b.id)}
                              title={b.name}
                              className={`px-2 py-1 rounded-md text-xxs font-bold border transition-all ${
                                selected
                                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              {b.gradeLabel}
                            </button>
                          );
                        })}
                        <button
                          onClick={() =>
                            updateLocal(template.id, { targetBuildings: [] })
                          }
                          className={`px-2 py-1 rounded-md text-xxs font-bold border transition-all ${
                            local.targetBuildings.length === 0
                              ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          ALL
                        </button>
                      </div>
                    </>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 ml-auto pl-3 border-l border-slate-100 shrink-0">
                    <button
                      onClick={() => void handleSave(template.id)}
                      disabled={isSaving || !hasUnsaved}
                      title={hasUnsaved ? 'Save changes' : 'No changes to save'}
                      className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        hasUnsaved
                          ? 'bg-orange-500 hover:bg-orange-600 text-white'
                          : 'text-slate-300 hover:bg-brand-blue-primary hover:text-white'
                      }`}
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
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

                {/* Widget count footer */}
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xxs text-slate-400">
                  {template.widgets.length} widget
                  {template.widgets.length !== 1 ? 's' : ''} captured
                  {template.targetBuildings.length > 0 && (
                    <>
                      {' '}
                      · {template.targetBuildings.length} building
                      {template.targetBuildings.length !== 1 ? 's' : ''}
                    </>
                  )}
                  {' · '}by {template.createdBy}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

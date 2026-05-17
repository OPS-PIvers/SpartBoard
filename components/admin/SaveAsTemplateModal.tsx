import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  addDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { LayoutTemplate, Save, RefreshCw, Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  Dashboard,
  DashboardTemplate,
  AnyTemplate,
  Collection as CollectionType,
  CollectionTemplate,
  BoardTemplateSnapshot,
  WidgetData,
  isCollectionTemplate,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { sanitizeBoardSnapshot } from '@/utils/dashboardSanitize';
import { mockTemplateStore } from '@/hooks/useTemplateStore';

/**
 * Discriminated target passed to `SaveAsTemplateModal`.
 *
 * - `'board'`: capture a single Dashboard as a Board template.
 * - `'collection'`: capture a Collection + its ordered child Boards as a
 *   Collection template. `boards` must contain only the direct child Boards
 *   of `collection`, in display order.
 */
export type SaveTemplateTarget =
  | { kind: 'board'; dashboard: Dashboard }
  | { kind: 'collection'; collection: CollectionType; boards: Dashboard[] };

interface SaveAsTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: SaveTemplateTarget | null;
}

const TEMPLATES_COLLECTION = 'dashboard_templates';

export const SaveAsTemplateModal: React.FC<SaveAsTemplateModalProps> = ({
  isOpen,
  onClose,
  target,
}) => {
  const { user } = useAuth();
  const BUILDINGS = useAdminBuildings();
  const [templates, setTemplates] = useState<AnyTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Update existing template state
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [updating, setUpdating] = useState(false);

  // New template state
  const [newName, setNewName] = useState('');
  const [newBuildings, setNewBuildings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Subscribe to templates while modal is open. Filters by target kind so
  // teachers updating a Board template never see Collection templates in
  // the picker (and vice versa) — overwriting across types would corrupt
  // the doc shape.
  useEffect(() => {
    if (!isOpen) return;
    if (isAuthBypass) {
      // In auth-bypass / E2E mode, read from the in-memory mock store.
      // Filter by target kind so the picker only shows same-kind templates.
      const all = mockTemplateStore.getAll();
      const filtered = all.filter((t) =>
        target?.kind === 'collection'
          ? isCollectionTemplate(t)
          : !isCollectionTemplate(t)
      );
      setTemplates(filtered);
      setLoadingTemplates(false);
      return;
    }

    setLoadingTemplates(true);
    const q = query(
      collection(db, TEMPLATES_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => ({
          ...(d.data() as AnyTemplate),
          id: d.id,
        }));
        const filtered = all.filter((t) =>
          target?.kind === 'collection'
            ? isCollectionTemplate(t)
            : !isCollectionTemplate(t)
        );
        setTemplates(filtered);
        setLoadingTemplates(false);
      },
      (err) => {
        console.error('Failed to load templates:', err);
        setLoadingTemplates(false);
      }
    );
    return unsub;
    // Dep is target?.kind, not target — we only need to re-subscribe when
    // the discriminator flips (Board ↔ Collection), not on every target
    // object-identity change. The caller (BoardsModal) null-resets target
    // on close, so isOpen toggling guarantees a fresh subscription per
    // open even if the same kind is reused for a different target.
  }, [isOpen, target?.kind]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedTemplateId('');
      setNewName('');
      setNewBuildings([]);
      setMessage(null);
    }
  }, [isOpen]);

  /** Board-template payload: widgets + style snapshot, sanitized. */
  const captureBoardForBoardTemplate = (dashboard: Dashboard) => {
    const cleaned = sanitizeBoardSnapshot(dashboard);
    return {
      widgets: cleaned.widgets.map((w: WidgetData) => ({
        ...w,
        isLocked: undefined,
        config: structuredClone(w.config),
      })),
      globalStyle: cleaned.globalStyle ?? undefined,
      background: cleaned.background ?? undefined,
    };
  };

  /** Each Board in a Collection becomes one BoardTemplateSnapshot. */
  const captureBoardForCollectionTemplate = (
    dashboard: Dashboard
  ): BoardTemplateSnapshot => {
    const cleaned = sanitizeBoardSnapshot(dashboard);
    return {
      id: cleaned.id,
      name: cleaned.name,
      background: cleaned.background,
      widgets: cleaned.widgets.map((w: WidgetData) => ({
        ...w,
        isLocked: undefined,
        config: structuredClone(w.config),
      })),
      ...(cleaned.globalStyle !== undefined && {
        globalStyle: cleaned.globalStyle,
      }),
      ...(cleaned.settings !== undefined && { settings: cleaned.settings }),
      ...(cleaned.libraryOrder !== undefined && {
        libraryOrder: cleaned.libraryOrder,
      }),
      ...(cleaned.viewportWidth !== undefined && {
        viewportWidth: cleaned.viewportWidth,
      }),
      ...(cleaned.viewportHeight !== undefined && {
        viewportHeight: cleaned.viewportHeight,
      }),
      createdAt: cleaned.createdAt,
    };
  };

  const handleUpdate = async () => {
    if (!target || !selectedTemplateId) return;
    setUpdating(true);
    setMessage(null);
    try {
      if (isAuthBypass) {
        // In auth-bypass / E2E mode, merge the update into the mock store.
        const existing = mockTemplateStore
          .getAll()
          .find((t) => t.id === selectedTemplateId);
        if (existing) {
          if (target.kind === 'board') {
            mockTemplateStore.save({
              ...existing,
              ...captureBoardForBoardTemplate(target.dashboard),
              updatedAt: Date.now(),
            } as AnyTemplate);
          } else {
            mockTemplateStore.save({
              ...existing,
              collectionSnapshot: {
                name: target.collection.name,
                ...(target.collection.color !== undefined && {
                  color: target.collection.color,
                }),
                ...(target.collection.icon !== undefined && {
                  icon: target.collection.icon,
                }),
              },
              boardSnapshots: target.boards.map(
                captureBoardForCollectionTemplate
              ),
              updatedAt: Date.now(),
            } as AnyTemplate);
          }
        }
      } else if (target.kind === 'board') {
        await setDoc(
          doc(db, TEMPLATES_COLLECTION, selectedTemplateId),
          {
            ...captureBoardForBoardTemplate(target.dashboard),
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      } else {
        await setDoc(
          doc(db, TEMPLATES_COLLECTION, selectedTemplateId),
          {
            collectionSnapshot: {
              name: target.collection.name,
              ...(target.collection.color !== undefined && {
                color: target.collection.color,
              }),
              ...(target.collection.icon !== undefined && {
                icon: target.collection.icon,
              }),
            },
            boardSnapshots: target.boards.map(
              captureBoardForCollectionTemplate
            ),
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }
      setMessage({ type: 'success', text: 'Template updated successfully.' });
    } catch (err) {
      console.error('Failed to update template:', err);
      setMessage({ type: 'error', text: 'Failed to update template.' });
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveNew = async () => {
    if (!target || !newName.trim() || !user?.email) return;
    setSaving(true);
    setMessage(null);
    try {
      const now = Date.now();
      let payload:
        | Omit<DashboardTemplate, 'id'>
        | Omit<CollectionTemplate, 'id'>;
      if (target.kind === 'board') {
        payload = {
          type: 'board',
          name: newName.trim(),
          description: '',
          ...captureBoardForBoardTemplate(target.dashboard),
          tags: [],
          targetGradeLevels: [],
          targetBuildings: newBuildings,
          enabled: true,
          accessLevel: 'public',
          createdAt: now,
          updatedAt: now,
          createdBy: user.email,
        };
      } else {
        payload = {
          type: 'collection',
          name: newName.trim(),
          description: '',
          collectionSnapshot: {
            name: target.collection.name,
            ...(target.collection.color !== undefined && {
              color: target.collection.color,
            }),
            ...(target.collection.icon !== undefined && {
              icon: target.collection.icon,
            }),
          },
          boardSnapshots: target.boards.map(captureBoardForCollectionTemplate),
          tags: [],
          targetGradeLevels: [],
          targetBuildings: newBuildings,
          enabled: true,
          accessLevel: 'public',
          createdAt: now,
          updatedAt: now,
          createdBy: user.email,
        };
      }
      if (isAuthBypass) {
        // In auth-bypass / E2E mode, write to the in-memory mock store
        // instead of Firestore (db is a {} stub; addDoc would throw).
        const id = crypto.randomUUID();
        mockTemplateStore.save({ ...payload, id } as AnyTemplate);
      } else {
        await addDoc(collection(db, TEMPLATES_COLLECTION), payload);
      }
      setMessage({
        type: 'success',
        text: `Template "${newName.trim()}" saved.`,
      });
      setNewName('');
      setNewBuildings([]);
    } catch (err) {
      console.error('Failed to save template:', err);
      setMessage({ type: 'error', text: 'Failed to save template.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleBuilding = (id: string) => {
    setNewBuildings((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        target?.kind === 'collection'
          ? 'Save Collection as Template'
          : 'Save Board as Template'
      }
      maxWidth="max-w-lg"
      zIndex="z-modal-deep"
    >
      <div className="space-y-6 p-1">
        {message && (
          <div
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Section A: Update existing template */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-brand-blue-primary" />
            <h3 className="font-bold text-slate-800 text-sm">
              Update Existing Template
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Overwrite a template&apos;s widgets and style with the current
            board. Its name, access settings, and buildings are preserved.
          </p>
          {loadingTemplates ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-slate-400 italic">
              No templates saved yet.
            </p>
          ) : (
            <div className="flex gap-2">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
              >
                <option value="">Select a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void handleUpdate()}
                disabled={!selectedTemplateId || updating}
                className="flex items-center gap-2 px-4 py-2 bg-brand-blue-primary text-white rounded-lg font-bold text-sm hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
              >
                {updating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Update
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100" />

        {/* Section B: Save as new template */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-brand-blue-primary" />
            <h3 className="font-bold text-slate-800 text-sm">
              Save as New Template
            </h3>
          </div>

          <div className="space-y-1">
            <label className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
              Template Name *
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Morning Routine"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
            />
          </div>

          {BUILDINGS.length > 0 && (
            <div className="space-y-2">
              <label className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
                Buildings (empty = all)
              </label>
              <div className="flex gap-2 flex-wrap">
                {BUILDINGS.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => toggleBuilding(b.id)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                      newBuildings.includes(b.id)
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

          <button
            onClick={() => void handleSaveNew()}
            disabled={!newName.trim() || saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-blue-primary text-white rounded-lg font-bold text-sm hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save New Template
          </button>
        </div>
      </div>
    </Modal>
  );
};

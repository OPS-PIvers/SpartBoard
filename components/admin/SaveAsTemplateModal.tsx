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
import { Dashboard, DashboardTemplate, WidgetData } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';

interface SaveAsTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDashboard: Dashboard | null;
}

const TEMPLATES_COLLECTION = 'dashboard_templates';

export const SaveAsTemplateModal: React.FC<SaveAsTemplateModalProps> = ({
  isOpen,
  onClose,
  currentDashboard,
}) => {
  const { user } = useAuth();
  const BUILDINGS = useAdminBuildings();
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
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

  // Subscribe to templates while modal is open
  useEffect(() => {
    if (!isOpen) return;
    if (isAuthBypass) {
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
        setTemplates(
          snap.docs.map((d) => ({
            ...(d.data() as DashboardTemplate),
            id: d.id,
          }))
        );
        setLoadingTemplates(false);
      },
      (err) => {
        console.error('Failed to load templates:', err);
        setLoadingTemplates(false);
      }
    );
    return unsub;
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedTemplateId('');
      setNewName('');
      setNewBuildings([]);
      setMessage(null);
    }
  }, [isOpen]);

  const captureWidgets = (dashboard: Dashboard): WidgetData[] =>
    dashboard.widgets.map((w) => ({
      ...w,
      isLocked: undefined,
      config: structuredClone(w.config),
    }));

  const handleUpdate = async () => {
    if (!currentDashboard || !selectedTemplateId) return;
    setUpdating(true);
    setMessage(null);
    try {
      await setDoc(
        doc(db, TEMPLATES_COLLECTION, selectedTemplateId),
        {
          widgets: captureWidgets(currentDashboard),
          globalStyle: currentDashboard.globalStyle ?? null,
          background: currentDashboard.background ?? null,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      setMessage({ type: 'success', text: 'Template updated successfully.' });
    } catch (err) {
      console.error('Failed to update template:', err);
      setMessage({ type: 'error', text: 'Failed to update template.' });
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveNew = async () => {
    if (!currentDashboard || !newName.trim() || !user?.email) return;
    setSaving(true);
    setMessage(null);
    try {
      const now = Date.now();
      const template: Omit<DashboardTemplate, 'id'> = {
        name: newName.trim(),
        description: '',
        widgets: captureWidgets(currentDashboard),
        globalStyle: currentDashboard.globalStyle,
        background: currentDashboard.background,
        tags: [],
        targetGradeLevels: [],
        targetBuildings: newBuildings,
        enabled: true,
        accessLevel: 'public',
        createdAt: now,
        updatedAt: now,
        createdBy: user.email,
      };
      await addDoc(collection(db, TEMPLATES_COLLECTION), template);
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
      title="Save Board as Template"
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

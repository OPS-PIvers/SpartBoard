/**
 * PresetSubEmailsManager — admin UI for `/preset_sub_emails/{buildingId}`.
 *
 * Teachers picking a "Substitute (View-Only)" share see these emails as
 * one-click chips when configuring sub-Drive access in
 * ShareLinkCreatorModal. Admins manage them per building (one doc per
 * canonical building id, `{ emails: string[] }`).
 *
 * Structure: a top-level building picker plus a keyed `<BuildingPresetEditor>`
 * child — re-keying on building id resets the editor's local draft state
 * cleanly without setState-in-effect.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { GraduationCap, Mail, Plus, Save, Trash2 } from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { BUILDINGS, canonicalBuildingId } from '@/config/buildings';

const ORONO_EMAIL_REGEX = /^[^\s@]+@orono\.k12\.mn\.us$/i;

export const PresetSubEmailsManager: React.FC = () => {
  const adminBuildings = useAdminBuildings();
  const buildings = useMemo(() => {
    const list = adminBuildings.length > 0 ? adminBuildings : BUILDINGS;
    return list.map((b) => ({ id: canonicalBuildingId(b.id), name: b.name }));
  }, [adminBuildings]);

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    () => buildings[0]?.id ?? ''
  );

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
          <GraduationCap className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Substitute presets
          </h2>
          <p className="text-xs text-slate-600">
            Per-building sub email shortcuts. Teachers see these as one-click
            chips when creating a Substitute (View-Only) share.
          </p>
        </div>
      </div>

      <div className="mb-4">
        <label
          htmlFor="preset-sub-building"
          className="block text-xs font-bold text-slate-700 mb-1"
        >
          Building
        </label>
        <select
          id="preset-sub-building"
          value={selectedBuildingId}
          onChange={(e) => setSelectedBuildingId(e.target.value)}
          className="w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
        >
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {selectedBuildingId && (
        <BuildingPresetEditor
          key={selectedBuildingId}
          buildingId={selectedBuildingId}
        />
      )}
    </div>
  );
};

interface Snapshot {
  emails: string[];
  loaded: boolean;
}

const BuildingPresetEditor: React.FC<{ buildingId: string }> = ({
  buildingId,
}) => {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot>({
    emails: [],
    loaded: false,
  });
  // Editable draft layered on top of the snapshot. Initialized empty; once
  // the first snapshot arrives, an in-render sync (below) seeds it with the
  // canonical list. Subsequent local edits live here.
  const [draftEmails, setDraftEmails] = useState<string[]>([]);
  const [draftSeededAt, setDraftSeededAt] = useState<number | null>(null);

  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ref = doc(db, 'preset_sub_emails', buildingId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        const list = Array.isArray(data?.emails)
          ? (data.emails as unknown[]).filter(
              (v): v is string => typeof v === 'string'
            )
          : [];
        setSnapshot({ emails: list, loaded: true });
      },
      (err) => {
        console.error('[PresetSubEmailsManager] snapshot error:', err);
        setSnapshot({ emails: [], loaded: true });
      }
    );
    return unsub;
  }, [buildingId]);

  // Seed the draft once when the first snapshot arrives (in-render sync —
  // see CLAUDE.md "Adjusting state while rendering"). Subsequent snapshots
  // don't overwrite local edits.
  if (snapshot.loaded && draftSeededAt === null) {
    setDraftEmails(snapshot.emails);
    setDraftSeededAt(Date.now());
  }

  const dirty = useMemo(() => {
    if (!snapshot.loaded) return false;
    if (draftEmails.length !== snapshot.emails.length) return true;
    return draftEmails.some((e, i) => e !== snapshot.emails[i]);
  }, [draftEmails, snapshot]);

  const addEmail = () => {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    if (!ORONO_EMAIL_REGEX.test(trimmed)) {
      setError('Must end with @orono.k12.mn.us');
      return;
    }
    if (draftEmails.includes(trimmed)) {
      setEmailInput('');
      return;
    }
    setDraftEmails((prev) => [...prev, trimmed]);
    setEmailInput('');
    setError(null);
  };

  const removeEmail = (email: string) => {
    setDraftEmails((prev) => prev.filter((e) => e !== email));
  };

  const save = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'preset_sub_emails', buildingId),
        {
          emails: draftEmails,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );
      setSavedAt(Date.now());
    } catch (err) {
      console.error('[PresetSubEmailsManager] save failed:', err);
      setError('Failed to save. Check Firestore rules and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!snapshot.loaded) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-bold text-slate-700 mb-2">
        {draftEmails.length} preset{' '}
        {draftEmails.length === 1 ? 'email' : 'emails'}
      </div>
      {draftEmails.length === 0 ? (
        <div className="text-xs text-slate-500 italic py-3">
          No presets yet. Add the first one below.
        </div>
      ) : (
        <ul className="space-y-1 mb-3">
          {draftEmails.map((email) => (
            <li
              key={email}
              className="flex items-center gap-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
            >
              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate flex-1">{email}</span>
              <button
                type="button"
                onClick={() => removeEmail(email)}
                aria-label="Remove preset"
                className="shrink-0 text-slate-400 hover:text-red-500 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          type="email"
          value={emailInput}
          onChange={(e) => {
            setEmailInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addEmail();
            }
          }}
          placeholder="ohssub@orono.k12.mn.us"
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
        />
        <button
          type="button"
          onClick={addEmail}
          className="shrink-0 inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-sm font-bold text-slate-700 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex items-center justify-between">
        <div className="text-[11px] text-slate-500">
          {savedAt
            ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
            : dirty
              ? 'Unsaved changes'
              : ''}
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold px-4 py-1.5 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
};

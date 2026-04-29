import React from 'react';
import { Save, Download, Trash2 } from 'lucide-react';
import { Station, SavedStationsPreset, StationsConfig } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useStorage } from '@/hooks/useStorage';

interface SavedPresetsPanelProps {
  stations: Station[];
  onLoad: (stations: Station[]) => void;
}

export const SavedPresetsPanel: React.FC<SavedPresetsPanelProps> = ({
  stations,
  onLoad,
}) => {
  const { savedWidgetConfigs, saveWidgetConfig } = useAuth();
  const { addToast } = useDashboard();
  const { showConfirm, showPrompt } = useDialog();
  const { deleteFile } = useStorage();

  const savedLibrary: SavedStationsPreset[] =
    (savedWidgetConfigs.stations as Partial<StationsConfig> | undefined)
      ?.savedLibrary ?? [];

  const handleSave = async () => {
    if (stations.length === 0) {
      addToast('Add at least one station before saving.', 'info');
      return;
    }
    const name = await showPrompt('What should we call this station set?', {
      title: 'Save station set',
      placeholder: 'e.g. Wednesday lab rotation',
      confirmLabel: 'Save',
    });
    if (!name?.trim()) return;
    const preset: SavedStationsPreset = {
      id: crypto.randomUUID(),
      name: name.trim(),
      // Snapshot stations only — assignments belong to the live widget instance.
      stations: stations.map((s) => ({ ...s })),
      createdAt: Date.now(),
    };
    saveWidgetConfig('stations', {
      savedLibrary: [...savedLibrary, preset],
    });
    addToast(`Saved "${preset.name}" to your station library.`, 'success');
  };

  const handleLoad = async (preset: SavedStationsPreset) => {
    if (stations.length > 0) {
      const ok = await showConfirm(
        'The stations currently on this widget will be replaced. Student assignments will be cleared.',
        {
          title: `Load "${preset.name}"?`,
          confirmLabel: 'Load',
          variant: 'danger',
        }
      );
      if (!ok) return;
    }
    // Re-stamp ids so loading the same preset twice doesn't collide with
    // assignment keys from the previous instance.
    const restamped = preset.stations.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
    }));
    onLoad(restamped);
    addToast(`Loaded "${preset.name}".`, 'success');
  };

  const handleDelete = async (preset: SavedStationsPreset) => {
    const ok = await showConfirm(
      'Any uploaded images for this preset will be removed from your Drive.',
      {
        title: `Delete "${preset.name}"?`,
        confirmLabel: 'Delete',
        variant: 'danger',
      }
    );
    if (!ok) return;
    // Determine which images on this preset are also referenced elsewhere
    // (other presets) and skip deleting those — only delete URLs uniquely
    // owned by this preset, so we don't break a sibling preset by mistake.
    const otherPresetUrls = new Set<string>();
    for (const p of savedLibrary) {
      if (p.id === preset.id) continue;
      for (const s of p.stations) {
        if (s.imageUrl) otherPresetUrls.add(s.imageUrl);
      }
    }
    saveWidgetConfig('stations', {
      savedLibrary: savedLibrary.filter((p) => p.id !== preset.id),
    });
    // Destructive cleanup — best-effort. Aggregate failures so the teacher
    // sees a single toast rather than silent dev-only console warnings.
    let failedCount = 0;
    for (const station of preset.stations) {
      if (!station.imageUrl) continue;
      if (otherPresetUrls.has(station.imageUrl)) continue;
      try {
        await deleteFile(station.imageUrl);
      } catch (err) {
        failedCount++;
        console.warn('[SavedPresetsPanel] Failed to delete preset image', err);
      }
    }
    if (failedCount > 0) {
      addToast(
        `Deleted "${preset.name}", but ${failedCount} image${failedCount === 1 ? '' : 's'} couldn't be removed from Drive — you may want to clean up manually.`,
        'info'
      );
    } else {
      addToast(`Deleted "${preset.name}".`, 'info');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black text-slate-700 uppercase tracking-widest">
            Saved Presets
          </p>
          <p className="text-xxs text-slate-400">
            Reuse a station setup later. Stations only — student assignments
            aren&apos;t saved.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xxs font-black uppercase tracking-widest hover:bg-brand-blue-dark transition-colors shadow-sm"
        >
          <Save size={12} />
          Save Current
        </button>
      </div>

      {savedLibrary.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
          <p className="text-xs text-slate-400">
            No saved presets yet. Build a station set and click &ldquo;Save
            Current.&rdquo;
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {savedLibrary.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-slate-700 truncate">
                  {preset.name}
                </div>
                <div className="text-xxs text-slate-400">
                  {preset.stations.length} station
                  {preset.stations.length === 1 ? '' : 's'} ·{' '}
                  {new Date(preset.createdAt).toLocaleDateString()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleLoad(preset)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-600 text-xxs font-bold uppercase tracking-widest transition-colors"
              >
                <Download size={11} />
                Load
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(preset)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-brand-red-primary hover:bg-red-50 transition-colors"
                aria-label={`Delete preset ${preset.name}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

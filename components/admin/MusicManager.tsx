import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  Edit2,
  GripVertical,
  Music,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { db } from '@/config/firebase';
import { MusicStation } from '@/types';
import { Button } from '../common/Button';

export const MusicManager: React.FC = () => {
  const [stations, setStations] = useState<MusicStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MusicStation>>({});

  useEffect(() => {
    const fetchStations = async () => {
      try {
        const docRef = doc(db, 'global_music_stations', 'library');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as { stations?: MusicStation[] };
          const loaded: MusicStation[] = data.stations ?? [];
          setStations(loaded.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
        }
      } catch (err) {
        console.error('Failed to load music stations', err);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchStations();
  }, []);

  const saveToFirestore = async (updated: MusicStation[]) => {
    try {
      await setDoc(
        doc(db, 'global_music_stations', 'library'),
        { stations: updated },
        { merge: true }
      );
    } catch (err) {
      console.error('Failed to save music stations', err);
    }
  };

  const handleAddStation = () => {
    const newStation: MusicStation = {
      id: crypto.randomUUID(),
      title: 'New Station',
      channel: 'Channel / Artist',
      url: '',
      thumbnail: '',
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      isActive: true,
      order: stations.length,
    };
    const updated = [...stations, newStation];
    setStations(updated);
    void saveToFirestore(updated);
    setEditingId(newStation.id);
    setEditForm(newStation);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const updated = stations.map((s) =>
      s.id === editingId ? ({ ...s, ...editForm } as MusicStation) : s
    );
    setStations(updated);
    void saveToFirestore(updated);
    setEditingId(null);
    setEditForm({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const deleteStation = (id: string) => {
    if (!window.confirm('Delete this station?')) return;
    const updated = stations.filter((s) => s.id !== id);
    // Re-index order
    const reindexed = updated.map((s, i) => ({ ...s, order: i }));
    setStations(reindexed);
    void saveToFirestore(reindexed);
  };

  const startEdit = (station: MusicStation) => {
    setEditingId(station.id);
    setEditForm(station);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Teachers see these stations in the Music Widget settings panel.
        </p>
        <Button
          onClick={handleAddStation}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Station
        </Button>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-slate-400 animate-pulse">
            Loading stations...
          </p>
        ) : stations.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <Music className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No stations added yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Click &quot;Add Station&quot; to create your first radio station.
            </p>
          </div>
        ) : (
          stations.map((station) => (
            <div
              key={station.id}
              className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
            >
              {editingId === station.id ? (
                <div className="p-4 space-y-3 bg-slate-50">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Title (e.g. Lofi Beats)"
                      value={editForm.title ?? ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, title: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <input
                      type="text"
                      placeholder="Channel / Artist"
                      value={editForm.channel ?? ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, channel: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <input
                      type="url"
                      placeholder="YouTube or Spotify URL"
                      value={editForm.url ?? ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, url: e.target.value })
                      }
                      className="col-span-2 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <input
                      type="url"
                      placeholder="Thumbnail image URL (optional)"
                      value={editForm.thumbnail ?? ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, thumbnail: e.target.value })
                      }
                      className="col-span-2 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={cancelEdit}>
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveEdit}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Save Station
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3">
                  <GripVertical className="w-5 h-5 text-slate-300 cursor-grab shrink-0" />
                  {station.thumbnail ? (
                    <img
                      src={station.thumbnail}
                      alt={station.title}
                      className="w-12 h-12 rounded-lg object-cover shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shadow-sm shrink-0">
                      <Music className="w-5 h-5 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {station.title}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {station.channel}
                    </p>
                  </div>
                  <div className="flex gap-1.5 pr-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(station)}
                      title="Edit station"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteStation(station.id)}
                      title="Delete station"
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

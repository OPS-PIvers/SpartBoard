import React, { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import {
  Edit2,
  GripVertical,
  Image,
  Music,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { db, storage } from '@/config/firebase';
import { MusicStation, MUSIC_GENRES, MusicGenre } from '@/types';
import { BUILDINGS } from '@/config/buildings';
import { useAuth } from '@/context/useAuth';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../widgets/InstructionalRoutines/ConfirmDialog';
import { extractYouTubeId } from '../widgets/MusicWidget/utils';

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

// Accepts only https YouTube or Spotify URLs. YouTube URLs must contain a
// recognisable video ID. Any https *.spotify.com URL is accepted; embed-URL
// conversion happens in the widget itself.
const isValidStationUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (
      parsed.hostname === 'youtu.be' ||
      parsed.hostname.includes('youtube.com')
    ) {
      return /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/.test(
        url
      );
    }
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'spotify.com' || hostname.endsWith('.spotify.com'))
      return true;
    return false;
  } catch {
    return false;
  }
};

// Accepts a valid https image URL, a data URI (base64), or empty string (optional).
const isValidImageUrl = (url: string): boolean => {
  if (!url) return true;
  if (url.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Thumbnail area sub-component
// ---------------------------------------------------------------------------

interface ThumbnailInputProps {
  thumbnail: string;
  onChange: (url: string) => void;
  isUploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
}

const ThumbnailInput: React.FC<ThumbnailInputProps> = ({
  thumbnail,
  onChange,
  isUploading,
  onUploadStart,
  onUploadEnd,
}) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const uploadImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      onUploadStart();
      try {
        const timestamp = Date.now();
        const path = `admin_music_thumbnails/${user?.uid ?? 'anon'}/${timestamp}-${file.name}`;
        const sRef = storageRef(storage, path);
        const snap = await uploadBytes(sRef, file);
        const url = await getDownloadURL(snap.ref);
        onChange(url);
      } catch (err) {
        console.error('Thumbnail upload failed', err);
      } finally {
        onUploadEnd();
      }
    },
    [user, onChange, onUploadStart, onUploadEnd]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadImageFile(file);
    e.target.value = '';
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = Array.from(e.clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) void uploadImageFile(file);
      }
    },
    [uploadImageFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) void uploadImageFile(file);
    },
    [uploadImageFile]
  );

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="col-span-2 space-y-2">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
        Thumbnail
      </label>

      {/* Drop zone / preview */}
      <div
        ref={dropZoneRef}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        tabIndex={0}
        className="relative flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 focus:outline-none focus:border-indigo-400 hover:border-slate-300 transition-colors"
      >
        {/* Preview */}
        <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
          {isUploading ? (
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          ) : thumbnail ? (
            <img
              src={thumbnail}
              alt="Thumbnail preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <Image className="w-5 h-5 text-slate-300" />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <input
            type="url"
            placeholder="https://… image URL"
            value={thumbnail.startsWith('data:') ? '' : thumbnail}
            onChange={handleUrlChange}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <p className="text-xs text-slate-400">
            Paste an image (Ctrl+V here), drop a file, or{' '}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-indigo-500 hover:underline font-medium"
            >
              browse
            </button>
          </p>
        </div>

        {thumbnail && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-1.5 right-1.5 p-0.5 rounded-full bg-white/80 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main MusicManager component
// ---------------------------------------------------------------------------

export const MusicManager: React.FC = () => {
  const [stations, setStations] = useState<MusicStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MusicStation>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isNewStation, setIsNewStation] = useState(false);
  const [isThumbnailUploading, setIsThumbnailUploading] = useState(false);

  useEffect(() => {
    const docRef = doc(db, 'global_music_stations', 'library');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as { stations?: MusicStation[] };
          const loaded: MusicStation[] = data.stations ?? [];
          setStations(loaded.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
        } else {
          setStations([]);
        }
        setIsLoading(false);
      },
      (err) => {
        console.error('Failed to load music stations', err);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
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
      genre: undefined,
      buildingIds: [],
    };
    setStations([...stations, newStation]);
    setEditingId(newStation.id);
    setEditForm(newStation);
    setIsNewStation(true);
  };

  // Auto-fetch YouTube thumbnail when URL changes
  const handleUrlChange = (url: string) => {
    const videoId = extractYouTubeId(url);
    const autoThumb =
      videoId && !editForm.thumbnail
        ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        : editForm.thumbnail;
    setEditForm({ ...editForm, url, thumbnail: autoThumb ?? '' });
  };

  const saveEdit = () => {
    if (!editingId) return;
    if (!isValidStationUrl(editForm.url ?? '')) {
      setValidationError(
        'Please enter a valid YouTube or Spotify URL (https only).'
      );
      return;
    }
    if (!isValidImageUrl(editForm.thumbnail ?? '')) {
      setValidationError(
        'Thumbnail must be a valid https image URL or an uploaded image.'
      );
      return;
    }
    setValidationError(null);
    const updated = stations.map((s) =>
      s.id === editingId ? ({ ...s, ...editForm } as MusicStation) : s
    );
    setStations(updated);
    void saveToFirestore(updated);
    setEditingId(null);
    setEditForm({});
    setIsNewStation(false);
  };

  const cancelEdit = () => {
    if (isNewStation && editingId) {
      setStations((prev) => prev.filter((s) => s.id !== editingId));
    }
    setEditingId(null);
    setEditForm({});
    setValidationError(null);
    setIsNewStation(false);
  };

  const deleteStation = (id: string) => {
    const updated = stations.filter((s) => s.id !== id);
    const reindexed = updated.map((s, i) => ({ ...s, order: i }));
    setStations(reindexed);
    void saveToFirestore(reindexed);
  };

  const startEdit = (station: MusicStation) => {
    setEditingId(station.id);
    setEditForm(station);
  };

  const toggleBuildingInForm = (buildingId: string) => {
    const current = editForm.buildingIds ?? [];
    const next = current.includes(buildingId)
      ? current.filter((id) => id !== buildingId)
      : [...current, buildingId];
    setEditForm({ ...editForm, buildingIds: next });
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
                  {/* Row 1: Title + Channel */}
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
                  </div>

                  {/* Row 2: URL (auto-fetches YouTube thumbnail) */}
                  <div>
                    <input
                      type="url"
                      placeholder="YouTube or Spotify URL"
                      value={editForm.url ?? ''}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    {extractYouTubeId(editForm.url ?? '') && (
                      <p className="text-xs text-emerald-600 mt-1">
                        YouTube video detected — thumbnail auto-fetched.
                      </p>
                    )}
                  </div>

                  {/* Row 3: Thumbnail (upload / paste / URL) */}
                  <div className="grid grid-cols-2 gap-3">
                    <ThumbnailInput
                      thumbnail={editForm.thumbnail ?? ''}
                      onChange={(url) =>
                        setEditForm({ ...editForm, thumbnail: url })
                      }
                      isUploading={isThumbnailUploading}
                      onUploadStart={() => setIsThumbnailUploading(true)}
                      onUploadEnd={() => setIsThumbnailUploading(false)}
                    />
                  </div>

                  {/* Row 4: Genre */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      Genre
                    </label>
                    <select
                      value={editForm.genre ?? ''}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          genre: (e.target.value as MusicGenre) || undefined,
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">— No genre —</option>
                      {MUSIC_GENRES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Row 5: Building assignment */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Visible to Buildings{' '}
                      <span className="normal-case font-normal text-slate-400">
                        (leave unchecked for all buildings)
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {BUILDINGS.map((building) => {
                        const checked = (editForm.buildingIds ?? []).includes(
                          building.id
                        );
                        return (
                          <button
                            key={building.id}
                            type="button"
                            onClick={() => toggleBuildingInForm(building.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                              checked
                                ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                checked
                                  ? 'bg-indigo-500 border-indigo-500'
                                  : 'border-slate-300'
                              }`}
                            >
                              {checked && (
                                <svg
                                  viewBox="0 0 10 8"
                                  className="w-2.5 h-2.5 fill-white"
                                >
                                  <path
                                    d="M1 4l2.5 2.5L9 1"
                                    stroke="white"
                                    strokeWidth="1.5"
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </span>
                            {building.name}
                            <span className="text-slate-400 font-normal">
                              ({building.gradeLabel})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {validationError && (
                    <p className="text-xs text-red-600">{validationError}</p>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={cancelEdit}>
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveEdit}
                      disabled={isThumbnailUploading}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {isThumbnailUploading ? 'Uploading…' : 'Save Station'}
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {station.title}
                      </p>
                      {station.genre && (
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full shrink-0">
                          {station.genre}
                        </span>
                      )}
                      {(() => {
                        const bids = station.buildingIds;
                        if (!bids || bids.length === 0) return null;
                        const label =
                          bids.length === 1
                            ? (BUILDINGS.find((b) => b.id === bids[0])?.name ??
                              '1 building')
                            : `${bids.length} buildings`;
                        return (
                          <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full shrink-0">
                            {label}
                          </span>
                        );
                      })()}
                    </div>
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
                      onClick={() => setDeleteConfirmId(station.id)}
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
      {deleteConfirmId && (
        <ConfirmDialog
          title="Delete Station"
          message="Are you sure you want to delete this station? This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            deleteStation(deleteConfirmId);
            setDeleteConfirmId(null);
          }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  );
};

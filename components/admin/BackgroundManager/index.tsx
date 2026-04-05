import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  deleteField,
} from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref, deleteObject } from 'firebase/storage';
import { BackgroundPreset, AccessLevel } from '@/types';
import { useStorage } from '@/hooks/useStorage';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { DriveFile } from '@/utils/googleDriveService';
import { extractYouTubeId } from '@/utils/youtube';
import { BUILDINGS } from '@/config/buildings';
import {
  Upload,
  Image as ImageIcon,
  Loader2,
  Shield,
  Users,
  Globe,
  Plus,
  X,
  Database,
  Video,
  LayoutGrid,
  List,
  Filter,
  Tag,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Toast } from '@/components/common/Toast';
import { Button } from '@/components/common/Button';
import { useDialog } from '@/context/useDialog';
import { ListPresetRow } from './ListPresetRow';
import { GridPresetCard } from './GridPresetCard';

const DEFAULT_PRESETS = [
  {
    url: 'https://images.unsplash.com/photo-1566378246598-5b11a0d486cc?q=80&w=2000',
    label: 'Chalkboard',
  },
  {
    url: 'https://images.unsplash.com/photo-1519750783826-e2420f4d687f?q=80&w=2000',
    label: 'Corkboard',
  },
  {
    url: 'https://images.unsplash.com/photo-1564507592333-c60657451dd7?q=80&w=2000',
    label: 'Taj Mahal',
  },
  {
    url: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=80&w=2000',
    label: 'Colosseum',
  },
  {
    url: 'https://images.unsplash.com/photo-1587590227264-0ac64ce63ce8?q=80&w=2000',
    label: 'Machu Picchu',
  },
  {
    url: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?q=80&w=2000',
    label: 'Great Wall of China',
  },
  {
    url: 'https://images.unsplash.com/photo-1579606030136-1e09549f2873?q=80&w=2000',
    label: 'Petra',
  },
  {
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=2000',
    label: 'Chichén Itzá',
  },
  {
    url: 'https://images.unsplash.com/photo-1503177119275-0aa32b3a7447?q=80&w=2000',
    label: 'Pyramids of Giza',
  },
  {
    url: 'https://images.unsplash.com/photo-1516306580123-e6e52b1b7b5f?q=80&w=2000',
    label: 'Christ the Redeemer',
  },
  {
    url: 'https://images.unsplash.com/photo-1543349689-9a4d426bee8e?q=80&w=2000',
    label: 'Eiffel Tower',
  },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const BackgroundManager: React.FC = () => {
  const { showConfirm } = useDialog();
  const [presets, setPresets] = useState<BackgroundPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeLabel, setYoutubeLabel] = useState('');
  const [addingYoutube, setAddingYoutube] = useState(false);

  // View state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [mediaType, setMediaType] = useState<'all' | 'images' | 'videos'>(
    'all'
  );

  // Filter state
  const [filterActive, setFilterActive] = useState<'all' | 'on' | 'off'>('all');
  const [filterAvailability, setFilterAvailability] = useState<
    'all' | AccessLevel
  >('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterBuilding, setFilterBuilding] = useState<string>('all');

  // Category management
  const [categoryManagerName, setCategoryManagerName] = useState('');
  const [editingCategoryValue, setEditingCategoryValue] = useState('');
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editingCategoryPresetId, setEditingCategoryPresetId] = useState<
    string | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadAdminBackground } = useStorage();
  const { user } = useAuth();
  const { driveService, isConnected: isDriveConnected } = useGoogleDrive();
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [showDrivePicker, setShowDrivePicker] = useState(false);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
  }, []);

  const loadDriveImages = async () => {
    if (!driveService) return;
    try {
      setLoadingDrive(true);
      const images = await driveService.getBackgroundImages();
      setDriveFiles(images);
      setShowDrivePicker(true);
    } catch (error) {
      console.error('Error loading Drive images:', error);
      showMessage('error', 'Failed to load images from Google Drive');
    } finally {
      setLoadingDrive(false);
    }
  };

  const handleDriveSelect = async (file: DriveFile) => {
    if (!driveService || !user) return;

    setUploading(true);
    setShowDrivePicker(false);
    let downloadURL = '';
    const presetId = crypto.randomUUID();

    try {
      // 1. Download blob from Google Drive
      const blob = await driveService.downloadFile(file.id);
      // 2. Convert to File object
      const imageFile = new File([blob], file.name, { type: file.mimeType });
      // 3. Upload to Firebase Storage (reuse admin path)
      downloadURL = await uploadAdminBackground(presetId, imageFile);

      const newPreset: BackgroundPreset = {
        id: presetId,
        url: downloadURL,
        label: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        active: true,
        accessLevel: 'public',
        betaUsers: [],
        createdAt: Date.now(),
      };

      await setDoc(doc(db, 'admin_backgrounds', newPreset.id), newPreset);
      setPresets((prev) => [newPreset, ...prev]);
      showMessage('success', 'Background imported from Google Drive');
    } catch (error) {
      console.error('Drive import failed:', error);
      showMessage('error', 'Failed to import from Drive');
      // Cleanup orphaned file if DB write failed
      if (downloadURL) {
        try {
          const fileRef = ref(storage, downloadURL);
          await deleteObject(fileRef);
        } catch (cleanupError) {
          console.error('Failed to cleanup orphaned file:', cleanupError);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  // Manage message timeout lifecycle
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [message]);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'admin_backgrounds'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setPresets(snapshot.docs.map((d) => d.data() as BackgroundPreset));
        setLoading(false);
      },
      (error) => {
        console.error('Error loading backgrounds:', error);
        showMessage('error', 'Failed to load backgrounds');
        setLoading(false);
      }
    );
    return unsub;
  }, [showMessage]);

  const restoreDefaults = async () => {
    const confirmed = await showConfirm(
      'This will add the 6 stock images to your managed list. Continue?',
      { title: 'Restore Defaults', confirmLabel: 'Restore' }
    );
    if (!confirmed) return;

    try {
      setActionLoading(true);
      for (const item of DEFAULT_PRESETS) {
        // Query by URL to avoid duplicates (IDs are random so we check against Firestore)
        const q = query(
          collection(db, 'admin_backgrounds'),
          where('url', '==', item.url)
        );
        const existing = await getDocs(q);

        if (existing.empty) {
          const newPreset: BackgroundPreset = {
            id: crypto.randomUUID(),
            url: item.url,
            label: item.label,
            active: true,
            accessLevel: 'public',
            betaUsers: [],
            createdAt: Date.now(),
          };
          await setDoc(doc(db, 'admin_backgrounds', newPreset.id), newPreset);
        }
      }
      showMessage('success', 'Default presets restored');
    } catch (error) {
      console.error('Error restoring defaults:', error);
      showMessage('error', 'Failed to restore defaults');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      showMessage('error', 'Image too large (Max 5MB)');
      return;
    }

    setUploading(true);
    let downloadURL = '';
    const presetId = crypto.randomUUID();
    try {
      // Use shared admin path with the pre-generated ID for security rules
      downloadURL = await uploadAdminBackground(presetId, file);

      const lastDotIndex = file.name.lastIndexOf('.');
      const baseName =
        lastDotIndex > 0 ? file.name.substring(0, lastDotIndex) : file.name;
      const label = baseName.replace(/[-_]/g, ' ');

      const newPreset: BackgroundPreset = {
        id: presetId,
        url: downloadURL,
        label,
        active: true,
        accessLevel: 'public',
        betaUsers: [],
        createdAt: Date.now(),
      };

      await setDoc(doc(db, 'admin_backgrounds', newPreset.id), newPreset);
      setPresets((prev) => [newPreset, ...prev]);
      showMessage('success', 'Background uploaded successfully');
    } catch (error) {
      console.error('Upload failed:', error);
      showMessage('error', 'Upload failed');
      if (downloadURL) {
        try {
          const fileRef = ref(storage, downloadURL);
          await deleteObject(fileRef);
        } catch (cleanupError) {
          console.error('Failed to cleanup orphaned file:', cleanupError);
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddYoutubeVideo = async () => {
    const videoId = extractYouTubeId(youtubeUrl.trim());
    if (!videoId) {
      showMessage('error', 'Invalid YouTube URL');
      return;
    }
    if (!youtubeLabel.trim()) {
      showMessage('error', 'Please provide a label (e.g. "Cozy Rain Cafe")');
      return;
    }

    setAddingYoutube(true);
    try {
      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      const presetId = crypto.randomUUID();

      const newPreset: BackgroundPreset = {
        id: presetId,
        url: youtubeUrl.trim(),
        label: youtubeLabel.trim(),
        thumbnailUrl,
        active: true,
        accessLevel: 'public',
        betaUsers: [],
        createdAt: Date.now(),
      };

      await setDoc(doc(db, 'admin_backgrounds', presetId), newPreset);
      setPresets((prev) => [newPreset, ...prev]);
      showMessage('success', 'YouTube background added successfully');
      setYoutubeUrl('');
      setYoutubeLabel('');
    } catch (error) {
      console.error('Failed to add YouTube background:', error);
      showMessage('error', 'Failed to add YouTube background');
    } finally {
      setAddingYoutube(false);
    }
  };

  const updatePreset = async (
    id: string,
    updates: Partial<BackgroundPreset>
  ) => {
    try {
      await updateDoc(doc(db, 'admin_backgrounds', id), updates);
      setPresets((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    } catch (error) {
      console.error('Error updating preset:', error);
      showMessage('error', 'Failed to update background');
    }
  };

  const clearPresetCategory = async (id: string) => {
    try {
      await updateDoc(doc(db, 'admin_backgrounds', id), {
        category: deleteField(),
      });
      setPresets((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const { category: _removed, ...rest } = p;
          return rest as BackgroundPreset;
        })
      );
    } catch (error) {
      console.error('Error clearing preset category:', error);
      showMessage('error', 'Failed to update background');
    }
  };

  const deletePreset = async (preset: BackgroundPreset) => {
    const confirmed = await showConfirm(
      'Are you sure you want to delete this background?',
      { title: 'Delete Background', variant: 'danger', confirmLabel: 'Delete' }
    );
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'admin_backgrounds', preset.id));
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
      showMessage('success', 'Background deleted');
    } catch (error) {
      console.error('Error deleting preset document:', error);
      showMessage('error', 'Failed to delete background');
      return;
    }

    // Then, best-effort delete file from Storage if it's not a stock image (Unsplash)
    if (preset.url.includes('firebasestorage.googleapis.com')) {
      try {
        const fileRef = ref(storage, preset.url);
        await deleteObject(fileRef);
      } catch (error) {
        console.warn('Failed to delete background file from storage:', error);
      }
    }
  };

  const addBetaUser = async (presetId: string, email: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      showMessage('error', 'Invalid email format');
      return;
    }

    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    if (!preset.betaUsers.includes(trimmedEmail)) {
      const newBetaUsers = [...preset.betaUsers, trimmedEmail];
      await updatePreset(presetId, { betaUsers: newBetaUsers });
    }
  };

  const removeBetaUser = async (presetId: string, email: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    const newBetaUsers = preset.betaUsers.filter((e) => e !== email);
    await updatePreset(presetId, { betaUsers: newBetaUsers });
  };

  const toggleBuildingId = async (presetId: string, buildingId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    const current = preset.buildingIds ?? [];
    const updated = current.includes(buildingId)
      ? current.filter((id) => id !== buildingId)
      : [...current, buildingId];
    await updatePreset(presetId, { buildingIds: updated });
  };

  const getAccessLevelIcon = (level: AccessLevel) => {
    switch (level) {
      case 'admin':
        return <Shield className="w-4 h-4" />;
      case 'beta':
        return <Users className="w-4 h-4" />;
      case 'public':
        return <Globe className="w-4 h-4" />;
    }
  };

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

  // Derive all unique categories from presets
  const allCategories = useMemo(
    () =>
      Array.from(
        new Set(presets.flatMap((p) => (p.category ? [p.category] : [])))
      ).sort(),
    [presets]
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    presets.forEach((p) => {
      if (p.category) {
        counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
      }
    });
    return counts;
  }, [presets]);

  // Filtered & typed presets
  const filteredPresets = useMemo(
    () =>
      presets.filter((preset) => {
        const isVideo = Boolean(extractYouTubeId(preset.url));
        if (mediaType === 'images' && isVideo) return false;
        if (mediaType === 'videos' && !isVideo) return false;
        if (filterActive === 'on' && !preset.active) return false;
        if (filterActive === 'off' && preset.active) return false;
        if (
          filterAvailability !== 'all' &&
          preset.accessLevel !== filterAvailability
        )
          return false;
        if (filterCategory !== 'all') {
          if (filterCategory === '__uncategorized__' && preset.category)
            return false;
          if (
            filterCategory !== '__uncategorized__' &&
            preset.category !== filterCategory
          )
            return false;
        }
        if (filterBuilding !== 'all') {
          const buildingIds = preset.buildingIds ?? [];
          // empty means all buildings, so passes filter
          if (buildingIds.length > 0 && !buildingIds.includes(filterBuilding))
            return false;
        }
        return true;
      }),
    [
      presets,
      mediaType,
      filterActive,
      filterAvailability,
      filterCategory,
      filterBuilding,
    ]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Message Toast */}
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}

      {/* Filters and Actions */}
      <div className="flex flex-col gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl mb-2">
        {/* Top Row: Actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="dark"
              onClick={() => void loadDriveImages()}
              disabled={!isDriveConnected}
              isLoading={loadingDrive}
              icon={<Database size={16} />}
              title={
                isDriveConnected
                  ? 'Select from Google Drive'
                  : 'Sign in with Google to use Drive'
              }
            >
              Google Drive
            </Button>
            <Button
              variant="secondary"
              onClick={() => void restoreDefaults()}
              icon={<Plus size={16} />}
              title="Restore original stock images"
              disabled={actionLoading}
            >
              Restore Defaults
            </Button>
            <Button
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
              isLoading={uploading}
              icon={<Upload size={16} />}
            >
              Upload New
            </Button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => void handleFileUpload(e)}
          />

          <button
            onClick={() => setShowCategoryManager((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-brand-blue-light text-xs font-semibold transition-all"
          >
            <Tag size={14} />
            Manage Categories
            {showCategoryManager ? (
              <ChevronUp size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </button>
        </div>

        {/* Category Manager */}
        {showCategoryManager && (
          <div className="bg-slate-50 border-t border-b border-slate-200 py-3 mt-1 mb-1 px-1">
            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-brand-blue-primary" />
              Categories
            </h4>
            <div className="flex flex-wrap gap-2 mb-3">
              {allCategories.length === 0 && (
                <p className="text-xs text-slate-400">
                  No categories yet. Add one below.
                </p>
              )}
              {allCategories.map((cat) => (
                <div
                  key={cat}
                  className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-700 shadow-sm"
                >
                  <Tag className="w-3 h-3 text-brand-blue-primary" />
                  {cat}
                  <span className="text-slate-400 ml-1">
                    ({categoryCounts.get(cat) ?? 0})
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 max-w-xs">
              <input
                type="text"
                placeholder="New category name..."
                value={categoryManagerName}
                onChange={(e) => setCategoryManagerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && categoryManagerName.trim()) {
                    showMessage(
                      'success',
                      `Category name "${categoryManagerName.trim()}" noted. Assign it to a background below to create it.`
                    );
                    setCategoryManagerName('');
                  }
                }}
                className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
              />
              <button
                onClick={() => {
                  if (categoryManagerName.trim()) {
                    showMessage(
                      'success',
                      `Category name "${categoryManagerName.trim()}" noted. Assign it to a background below to create it.`
                    );
                    setCategoryManagerName('');
                  }
                }}
                className="px-3 py-1.5 bg-brand-blue-primary text-white rounded-lg text-xs font-semibold hover:bg-brand-blue-dark transition-colors"
              >
                Note
              </button>
            </div>
            <p className="text-xxs text-slate-400 mt-2">
              Categories are created by assigning a name to any background in
              the list below.
            </p>
          </div>
        )}

        <div className="h-px bg-slate-200 w-full" />

        {/* Bottom Row: Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">
              Filter
            </span>
          </div>

          {/* Active filter */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500 font-medium">Active:</span>
            {(['all', 'on', 'off'] as const).map((val) => (
              <button
                key={val}
                onClick={() => setFilterActive(val)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                  filterActive === val
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {val === 'all' ? 'All' : val === 'on' ? 'On' : 'Off'}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-slate-200" />

          {/* Availability filter */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500 font-medium">
              Availability:
            </span>
            {(['all', 'admin', 'beta', 'public'] as const).map((val) => (
              <button
                key={val}
                onClick={() => setFilterAvailability(val)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                  filterAvailability === val
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {val === 'all'
                  ? 'All'
                  : val.charAt(0).toUpperCase() + val.slice(1)}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-slate-200" />

          {/* Category filter */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">
              Category:
            </span>
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                filterCategory === 'all'
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterCategory('__uncategorized__')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                filterCategory === '__uncategorized__'
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              Uncategorized
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                  filterCategory === cat
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-slate-200" />

          {/* Building filter */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">
              Building:
            </span>
            <button
              onClick={() => setFilterBuilding('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                filterBuilding === 'all'
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              All
            </button>
            {BUILDINGS.map((b) => (
              <button
                key={b.id}
                onClick={() => setFilterBuilding(b.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                  filterBuilding === b.id
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
                title={b.name}
              >
                {b.gradeLabel}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-slate-200" />

          {/* Media Type Toggle */}
          <div
            className="flex bg-white p-0.5 rounded-lg border border-slate-200"
            role="group"
            aria-label="Media type toggle"
          >
            {(
              [
                { value: 'all', label: 'All' },
                { value: 'images', label: 'Images', icon: ImageIcon },
                { value: 'videos', label: 'Videos', icon: Video },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setMediaType(tab.value)}
                aria-pressed={mediaType === tab.value}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  mediaType === tab.value
                    ? 'bg-slate-100 text-brand-blue-primary shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {tab.value === 'images' && <ImageIcon size={14} />}
                {tab.value === 'videos' && <Video size={14} />}
                {tab.label}
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className="ml-auto flex bg-white p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'grid'
                  ? 'bg-slate-100 text-brand-blue-primary shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Grid View"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === 'list'
                  ? 'bg-slate-100 text-brand-blue-primary shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title="List View"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* YouTube Video Preset Form */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-2">
        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Video className="w-4 h-4 text-red-600" />
          Add Ambient YouTube Video
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            placeholder="YouTube URL (e.g. https://www.youtube.com/watch?v=...)"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
          />
          <input
            type="text"
            placeholder='Label (e.g. "Cozy Rain Cafe")'
            value={youtubeLabel}
            onChange={(e) => setYoutubeLabel(e.target.value)}
            className="w-full sm:w-52 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
          />
          <Button
            variant="primary"
            onClick={() => void handleAddYoutubeVideo()}
            disabled={!youtubeUrl.trim() || !youtubeLabel.trim()}
            isLoading={addingYoutube}
            icon={<Plus size={16} />}
          >
            Add Video
          </Button>
        </div>
      </div>

      {/* Drive Picker Modal */}
      {showDrivePicker && (
        <div className="fixed inset-0 z-modal-nested flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-800">
                  Select Image from Google Drive
                </h3>
                <p className="text-sm text-slate-500">
                  Only images from your drive are shown
                </p>
              </div>
              <button
                onClick={() => setShowDrivePicker(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {driveFiles.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {driveFiles.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => void handleDriveSelect(file)}
                      className="group relative aspect-video bg-slate-100 rounded-xl overflow-hidden border-2 border-transparent hover:border-brand-blue-primary transition-all text-left"
                    >
                      {file.thumbnailLink ? (
                        <img
                          src={file.thumbnailLink.replace('=s220', '=s400')}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-slate-300" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                        <p className="text-white text-xs font-medium truncate">
                          {file.name}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                  <Database className="w-12 h-12 mb-2 opacity-20" />
                  <p>No images found in your Google Drive</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Background List / Grid */}
      <div className="flex-1">
        {filteredPresets.length === 0 ? (
          <div className="min-h-[200px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
            {presets.length === 0 ? (
              <>
                <ImageIcon className="w-12 h-12 mb-3 opacity-50" />
                <p className="font-bold">No managed backgrounds found.</p>
                <p className="text-sm">Upload images to get started.</p>
              </>
            ) : (
              <>
                <Filter className="w-10 h-10 mb-2 opacity-30" />
                <p className="font-bold">No backgrounds match the filters.</p>
              </>
            )}
          </div>
        ) : viewMode === 'list' ? (
          /* List View */
          <div className="space-y-2">
            {filteredPresets.map((preset) => (
              <ListPresetRow
                key={preset.id}
                preset={preset}
                editingId={editingId}
                editName={editName}
                editingCategoryPresetId={editingCategoryPresetId}
                editingCategoryValue={editingCategoryValue}
                allCategories={allCategories}
                setEditingId={setEditingId}
                setEditName={setEditName}
                setEditingCategoryPresetId={setEditingCategoryPresetId}
                setEditingCategoryValue={setEditingCategoryValue}
                updatePreset={updatePreset}
                clearPresetCategory={clearPresetCategory}
                deletePreset={deletePreset}
                addBetaUser={addBetaUser}
                removeBetaUser={removeBetaUser}
                toggleBuildingId={toggleBuildingId}
                getAccessLevelIcon={getAccessLevelIcon}
                getAccessLevelColor={getAccessLevelColor}
              />
            ))}
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 items-start">
            {filteredPresets.map((preset) => (
              <GridPresetCard
                key={preset.id}
                preset={preset}
                editingId={editingId}
                editName={editName}
                editingCategoryPresetId={editingCategoryPresetId}
                editingCategoryValue={editingCategoryValue}
                allCategories={allCategories}
                setEditingId={setEditingId}
                setEditName={setEditName}
                setEditingCategoryPresetId={setEditingCategoryPresetId}
                setEditingCategoryValue={setEditingCategoryValue}
                updatePreset={updatePreset}
                clearPresetCategory={clearPresetCategory}
                deletePreset={deletePreset}
                addBetaUser={addBetaUser}
                removeBetaUser={removeBetaUser}
                toggleBuildingId={toggleBuildingId}
                getAccessLevelIcon={getAccessLevelIcon}
                getAccessLevelColor={getAccessLevelColor}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

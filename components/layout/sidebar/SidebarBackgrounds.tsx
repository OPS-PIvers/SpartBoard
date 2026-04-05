import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, Loader2, Grid, Image as ImageIcon, Video } from 'lucide-react';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDashboard } from '@/context/useDashboard';
import { extractYouTubeId } from '@/utils/youtube';
import { BACKGROUND_CATEGORY_ORDER } from '@/utils/backgroundCategories';

interface ThumbnailButtonProps {
  id: string;
  label: string;
  thumbnailUrl?: string;
  isActive: boolean;
  onSelect: (id: string) => void;
}

const ThumbnailButton: React.FC<ThumbnailButtonProps> = ({
  id,
  label,
  thumbnailUrl,
  isActive,
  onSelect,
}) => (
  <button
    type="button"
    onClick={() => onSelect(id)}
    className={`group relative aspect-video rounded-lg overflow-hidden border transition-all ${
      isActive
        ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
        : 'border-slate-200'
    }`}
  >
    <img
      src={thumbnailUrl ?? id}
      alt={label}
      loading="lazy"
      decoding="async"
      className="w-full h-full object-cover"
    />
    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
      <span className="text-white text-xxxs font-bold uppercase px-1 text-center">
        {label}
      </span>
    </div>
  </button>
);

interface SidebarBackgroundsProps {
  isVisible: boolean;
}

export const SidebarBackgrounds: React.FC<SidebarBackgroundsProps> = ({
  isVisible,
}) => {
  const { presets, colors, gradients } = useBackgrounds();
  const {
    uploadBackgroundToDrive,
    getUserBackgroundsFromDrive,
    isInitialized,
  } = useGoogleDrive();
  const { activeDashboard, setBackground, addToast } = useDashboard();

  const [designTab, setDesignTab] = useState<'media' | 'colors' | 'my-uploads'>(
    'media'
  );
  const [activeCategory, setActiveCategory] = useState<string>('All');

  // My Uploads state
  const [userUploads, setUserUploads] = useState<string[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hasFetchedDrive, setHasFetchedDrive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-sort admin presets into images vs ambient videos
  const { imagePresets, videoPresets } = useMemo(() => {
    return presets.reduce<{
      imagePresets: typeof presets;
      videoPresets: typeof presets;
    }>(
      (acc, bg) => {
        if (extractYouTubeId(bg.id)) {
          acc.videoPresets.push(bg);
        } else {
          acc.imagePresets.push(bg);
        }
        return acc;
      },
      { imagePresets: [], videoPresets: [] }
    );
  }, [presets]);

  // Categories present in imagePresets: canonical order first, then any extras
  const availableCategories = useMemo(() => {
    const cats = new Set(imagePresets.map((bg) => bg.category));
    const canonical = BACKGROUND_CATEGORY_ORDER.filter((c) => cats.has(c));
    const extras = [...cats].filter(
      (c) => !(BACKGROUND_CATEGORY_ORDER as readonly string[]).includes(c)
    );
    return [...canonical, ...extras];
  }, [imagePresets]);

  // Reset stale activeCategory if it no longer exists in the available list
  if (
    activeCategory !== 'All' &&
    !availableCategories.some((c) => c === activeCategory)
  ) {
    setActiveCategory('All');
  }

  // When filtering: flat list for the active category; null means show all grouped
  const filteredImagePresets = useMemo(() => {
    if (activeCategory === 'All') return null;
    return imagePresets.filter((bg) => bg.category === activeCategory);
  }, [imagePresets, activeCategory]);

  // Grouped presets used when activeCategory === 'All'
  const groupedImagePresets = useMemo(() => {
    const groups = new Map<string, typeof imagePresets>();
    for (const bg of imagePresets) {
      const existing = groups.get(bg.category);
      if (existing) {
        existing.push(bg);
      } else {
        groups.set(bg.category, [bg]);
      }
    }
    // Canonical order first, then any unrecognized categories
    const allCategories = [
      ...BACKGROUND_CATEGORY_ORDER.filter((c) => groups.has(c)),
      ...[...groups.keys()].filter(
        (c) => !(BACKGROUND_CATEGORY_ORDER as readonly string[]).includes(c)
      ),
    ];
    return allCategories.map((c) => ({
      category: c,
      items: groups.get(c) ?? [],
    }));
  }, [imagePresets]);

  // Reset category filter when switching away from media tab
  const handleTabChange = (tab: typeof designTab) => {
    setDesignTab(tab);
    if (tab !== 'media') setActiveCategory('All');
  };

  // Fetch past uploads from Google Drive when the "My Uploads" tab is opened
  useEffect(() => {
    if (designTab !== 'my-uploads' || !isInitialized || hasFetchedDrive) return;

    const fetchUploads = async () => {
      setLoadingUploads(true);
      try {
        const urls = await getUserBackgroundsFromDrive();
        setUserUploads(urls);
      } catch {
        addToast('Failed to load past backgrounds from Drive', 'error');
      } finally {
        setHasFetchedDrive(true);
        setLoadingUploads(false);
      }
    };

    void fetchUploads();
  }, [
    designTab,
    isInitialized,
    hasFetchedDrive,
    getUserBackgroundsFromDrive,
    addToast,
  ]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      addToast('Image too large (Max 5MB)', 'error');
      return;
    }

    if (!isInitialized) {
      addToast('Google Drive is not connected. Please sign in again.', 'error');
      return;
    }

    setUploading(true);
    try {
      const downloadURL = await uploadBackgroundToDrive(file);
      setBackground(downloadURL);
      setUserUploads((prev) => [downloadURL, ...prev]);
      addToast('Custom background saved to your Drive', 'success');
    } catch (error) {
      console.error('Background upload failed:', error);
      addToast(
        error instanceof Error ? error.message : 'Upload failed',
        'error'
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className={`absolute inset-0 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${
        isVisible
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 invisible'
      }`}
    >
      {/* Tab bar */}
      <div className="flex bg-slate-100 p-0.5 rounded-lg text-xxs font-bold uppercase tracking-widest shrink-0">
        <button
          type="button"
          onClick={() => handleTabChange('media')}
          className={`flex-1 py-1.5 rounded-md transition-all ${
            designTab === 'media'
              ? 'bg-white shadow-sm text-brand-blue-primary'
              : 'text-slate-500'
          }`}
        >
          Media
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('colors')}
          className={`flex-1 py-1.5 rounded-md transition-all ${
            designTab === 'colors'
              ? 'bg-white shadow-sm text-brand-blue-primary'
              : 'text-slate-500'
          }`}
        >
          Colors
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('my-uploads')}
          className={`flex-1 py-1.5 rounded-md transition-all ${
            designTab === 'my-uploads'
              ? 'bg-white shadow-sm text-brand-blue-primary'
              : 'text-slate-500'
          }`}
        >
          My Uploads
        </button>
      </div>

      {/* ── Media tab ── */}
      {designTab === 'media' && (
        <div className="flex flex-col gap-4 pb-4">
          {/* Category filter chips — only shown when there are categorised images */}
          {availableCategories.length > 1 && (
            <div className="flex flex-wrap gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveCategory('All')}
                className={`px-2.5 py-1 rounded-full text-xxs font-bold uppercase tracking-wide transition-all border ${
                  activeCategory === 'All'
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-brand-blue-primary hover:text-brand-blue-primary'
                }`}
              >
                All
              </button>
              {availableCategories.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2.5 py-1 rounded-full text-xxs font-bold uppercase tracking-wide transition-all border ${
                    activeCategory === cat
                      ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-brand-blue-primary hover:text-brand-blue-primary'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Filtered view — specific category selected */}
          {filteredImagePresets !== null && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {filteredImagePresets.map((bg) => (
                  <ThumbnailButton
                    key={bg.id}
                    {...bg}
                    isActive={activeDashboard?.background === bg.id}
                    onSelect={setBackground}
                  />
                ))}
              </div>
              {filteredImagePresets.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-8">
                  No backgrounds in this category.
                </p>
              )}
            </div>
          )}

          {/* Grouped view — "All" selected */}
          {filteredImagePresets === null && (
            <div className="flex flex-col gap-6">
              {groupedImagePresets.map(({ category, items }) => (
                <div key={category} className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> {category}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((bg) => (
                      <ThumbnailButton
                        key={bg.id}
                        {...bg}
                        isActive={activeDashboard?.background === bg.id}
                        onSelect={setBackground}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {groupedImagePresets.length === 0 &&
                videoPresets.length === 0 && (
                  <p className="text-center text-xs text-slate-400 py-8">
                    No media backgrounds available yet.
                  </p>
                )}
            </div>
          )}

          {/* Ambient Videos — always shown at the bottom of the media tab */}
          {videoPresets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                <Video className="w-3 h-3" /> Ambient Videos
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {videoPresets.map((bg) => (
                  <ThumbnailButton
                    key={bg.id}
                    {...bg}
                    isActive={activeDashboard?.background === bg.id}
                    onSelect={setBackground}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Colors tab ── */}
      {designTab === 'colors' && (
        <div className="flex flex-col gap-6 pb-4">
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase">
              Solid Colors
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {colors.map((bg) => (
                <button
                  type="button"
                  key={bg.id}
                  onClick={() => setBackground(bg.id)}
                  className={`aspect-square rounded-lg border transition-all relative ${bg.id} ${
                    activeDashboard?.background === bg.id
                      ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                      : 'border-slate-200'
                  }`}
                >
                  {bg.label === 'Dot Grid' && (
                    <Grid className="w-4 h-4 absolute inset-0 m-auto text-slate-300" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase">
              Gradients
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {gradients.map((bg) => (
                <button
                  type="button"
                  key={bg.id}
                  onClick={() => setBackground(bg.id)}
                  className={`aspect-video rounded-lg border transition-all relative ${
                    activeDashboard?.background === bg.id
                      ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                      : 'border-slate-200'
                  }`}
                >
                  <div className={`w-full h-full rounded-md ${bg.id}`} />
                  <div className="absolute bottom-1.5 left-1.5 text-xxxs font-bold uppercase text-white drop-shadow-md">
                    {bg.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── My Uploads tab ── */}
      {designTab === 'my-uploads' && (
        <div className="flex flex-col gap-4 pb-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !isInitialized}
            className="w-full py-8 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-brand-blue-primary hover:text-brand-blue-primary hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Upload className="w-6 h-6 mb-2" />
                <span className="text-xs font-bold uppercase tracking-wide">
                  Upload Image
                </span>
                {!isInitialized && (
                  <span className="text-xxs mt-1 text-slate-400">
                    Sign in with Google to enable
                  </span>
                )}
              </>
            )}
          </button>

          {loadingUploads ? (
            <div className="flex justify-center p-4">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : userUploads.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {userUploads.map((url) => (
                <button
                  type="button"
                  key={url}
                  onClick={() => setBackground(url)}
                  className={`aspect-video rounded-lg overflow-hidden border transition-all ${
                    activeDashboard?.background === url
                      ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                      : 'border-slate-200'
                  }`}
                >
                  <img
                    src={url}
                    alt="Custom background"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 mt-2">
              Custom images you upload will be stored in your Google Drive and
              shared via link so they can be used as backgrounds.
            </p>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={(e) => void handleFileUpload(e)}
      />
    </div>
  );
};

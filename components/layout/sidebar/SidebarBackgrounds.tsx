import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Upload,
  Loader2,
  Video,
  Search,
  X,
  Check,
  ArrowRight,
  ArrowDownRight,
  ArrowDown,
  ArrowDownLeft,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { useBackgrounds } from '@/hooks/useBackgrounds';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDashboard } from '@/context/useDashboard';
import { extractYouTubeId } from '@/utils/youtube';
import { isCustomBackground } from '@/utils/backgrounds';

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

// ── Gradient direction options ──
const GRADIENT_DIRECTIONS = [
  { angle: '90deg', label: 'Right', icon: ArrowRight },
  { angle: '135deg', label: 'Down-Right', icon: ArrowDownRight },
  { angle: '180deg', label: 'Down', icon: ArrowDown },
  { angle: '225deg', label: 'Down-Left', icon: ArrowDownLeft },
] as const;

/** Max featured backgrounds shown per category in the overview */
const FEATURED_LIMIT = 6;

interface SidebarBackgroundsProps {
  isVisible: boolean;
}

export const SidebarBackgrounds: React.FC<SidebarBackgroundsProps> = ({
  isVisible,
}) => {
  const { presets, colors, patterns, gradients } = useBackgrounds();
  const {
    uploadBackgroundToDrive,
    getUserBackgroundsFromDrive,
    isInitialized,
  } = useGoogleDrive();
  const { activeDashboard, setBackground, addToast } = useDashboard();

  const [designTab, setDesignTab] = useState<'media' | 'colors' | 'my-uploads'>(
    'media'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Category detail panel — null = overview, string = detail view for that category
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Custom color picker state
  const [customColor, setCustomColor] = useState('#3b82f6');

  // Custom gradient creator state
  const [gradientColor1, setGradientColor1] = useState('#3b82f6');
  const [gradientColor2, setGradientColor2] = useState('#8b5cf6');
  const [gradientAngle, setGradientAngle] = useState('135deg');

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

  // Grouped presets sorted alphabetically by category
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
    // Alphabetical sort — new admin categories appear automatically
    return [...groups.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ category: c, items: groups.get(c) ?? [] }));
  }, [imagePresets]);

  // For each category, pick the featured items (or fallback to first N)
  const categoryFeaturedItems = useMemo(() => {
    const result = new Map<string, typeof imagePresets>();
    for (const { category, items } of groupedImagePresets) {
      const featured = items.filter((bg) => bg.featured);
      result.set(
        category,
        featured.length > 0
          ? featured.slice(0, FEATURED_LIMIT)
          : items.slice(0, FEATURED_LIMIT)
      );
    }
    return result;
  }, [groupedImagePresets]);

  // Search results across all presets (images + videos); null = no active search
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return presets.filter(
      (bg) =>
        bg.label.toLowerCase().includes(q) ||
        bg.category.toLowerCase().includes(q)
    );
  }, [presets, searchQuery]);

  // Items for the active category detail panel
  const activeCategoryItems = useMemo(() => {
    if (!activeCategory) return [];
    return (
      groupedImagePresets.find((g) => g.category === activeCategory)?.items ??
      []
    );
  }, [activeCategory, groupedImagePresets]);

  // Reset search when switching away from media tab.
  // activeCategory is intentionally preserved across tab switches so users
  // don't lose their place when briefly switching to Colors or My Uploads.
  const handleTabChange = (tab: typeof designTab) => {
    setDesignTab(tab);
    if (tab !== 'media') setSearchQuery('');
  };

  // Reset detail panel when sidebar is hidden
  useEffect(() => {
    if (!isVisible) setActiveCategory(null);
  }, [isVisible]);

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

  // Sync picker state when the active dashboard background changes
  const activeCustomValue = useMemo(() => {
    const bg = activeDashboard?.background ?? '';
    return isCustomBackground(bg) ? bg.slice('custom:'.length) : '';
  }, [activeDashboard?.background]);

  useEffect(() => {
    if (activeCustomValue.startsWith('#')) {
      setCustomColor(activeCustomValue);
      return;
    }

    const m = activeCustomValue.match(
      /^linear-gradient\(\s*([^,]+?)\s*,\s*(#[0-9a-fA-F]{3,8})\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)$/
    );
    if (m?.[1] && m[2] && m[3]) {
      setGradientAngle(m[1].trim());
      setGradientColor1(m[2]);
      setGradientColor2(m[3]);
    }
  }, [activeCustomValue]);

  // Check if a custom color/gradient is currently active
  const currentGradientValue = `linear-gradient(${gradientAngle}, ${gradientColor1}, ${gradientColor2})`;
  const isCustomColorActive =
    activeCustomValue.startsWith('#') && activeCustomValue === customColor;
  const isCustomGradientActive =
    activeCustomValue.startsWith('linear-gradient(') &&
    activeCustomValue === currentGradientValue;

  return (
    <div
      className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${
        isVisible
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 invisible'
      }`}
    >
      {/* Tab bar */}
      <div className="px-4 pt-4 shrink-0">
        <div className="flex bg-slate-100 p-0.5 rounded-lg text-xxs font-bold uppercase tracking-widest">
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
      </div>

      {/* ── Media tab ── */}
      {designTab === 'media' && (
        <div className="flex-1 relative overflow-hidden">
          {/* Overview panel */}
          <div
            className={`absolute inset-0 flex flex-col overflow-y-auto custom-scrollbar transition-[transform,opacity] duration-300 ease-in-out ${
              activeCategory === null
                ? 'translate-x-0 opacity-100 visible'
                : '-translate-x-full opacity-0 invisible'
            }`}
          >
            <div className="flex flex-col gap-3 p-4 pb-4">
              {/* Search input */}
              <div className="relative flex items-center shrink-0">
                <Search className="absolute left-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search backgrounds…"
                  aria-label="Search backgrounds"
                  className="w-full pl-8 pr-8 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:border-brand-blue-primary transition-colors"
                />
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Search results */}
              {searchResults !== null ? (
                <div className="flex flex-col gap-2">
                  {searchResults.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {searchResults.map((bg) => (
                        <ThumbnailButton
                          key={bg.id}
                          {...bg}
                          isActive={activeDashboard?.background === bg.id}
                          onSelect={setBackground}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-slate-400 py-8">
                      No backgrounds match &ldquo;{searchQuery}&rdquo;.
                    </p>
                  )}
                </div>
              ) : (
                /* Category overview — featured items only */
                <div className="flex flex-col gap-4">
                  {groupedImagePresets.map(({ category, items }) => {
                    const featured = categoryFeaturedItems.get(category) ?? [];
                    const hasMore = items.length > featured.length;
                    return (
                      <div key={category} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                            {category}
                            <span className="ml-1.5 text-slate-400 font-normal normal-case tracking-normal">
                              ({items.length})
                            </span>
                          </span>
                          {hasMore && (
                            <button
                              type="button"
                              onClick={() => setActiveCategory(category)}
                              className="flex items-center gap-0.5 text-xxs font-semibold text-brand-blue-primary hover:text-brand-blue-dark transition-colors"
                            >
                              See More
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {featured.map((bg) => (
                            <ThumbnailButton
                              key={bg.id}
                              {...bg}
                              isActive={activeDashboard?.background === bg.id}
                              onSelect={setBackground}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Ambient Videos section */}
                  {videoPresets.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5" />
                        Ambient Videos
                        <span className="text-slate-400 font-normal normal-case tracking-normal">
                          ({videoPresets.length})
                        </span>
                      </span>
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

                  {groupedImagePresets.length === 0 &&
                    videoPresets.length === 0 && (
                      <p className="text-center text-xs text-slate-400 py-8">
                        No media backgrounds available yet.
                      </p>
                    )}
                </div>
              )}
            </div>
          </div>

          {/* Category detail panel */}
          <div
            className={`absolute inset-0 flex flex-col overflow-y-auto custom-scrollbar transition-[transform,opacity] duration-300 ease-in-out ${
              activeCategory !== null
                ? 'translate-x-0 opacity-100 visible'
                : 'translate-x-full opacity-0 invisible'
            }`}
          >
            {/* Detail header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 shrink-0 bg-white">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="p-1 -ml-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Back to overview"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                {activeCategory}
                <span className="ml-1.5 text-slate-400 font-normal normal-case tracking-normal">
                  ({activeCategoryItems.length})
                </span>
              </span>
            </div>

            {/* Detail grid */}
            <div className="p-4 grid grid-cols-2 gap-2">
              {activeCategoryItems.map((bg) => (
                <ThumbnailButton
                  key={bg.id}
                  {...bg}
                  isActive={activeDashboard?.background === bg.id}
                  onSelect={setBackground}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Colors tab ── */}
      {designTab === 'colors' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col gap-6 p-4 pb-4">
            {/* ── Solid Colors ── */}
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
                    className={`aspect-square rounded-lg border transition-all ${bg.id} ${
                      activeDashboard?.background === bg.id
                        ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                        : 'border-slate-200'
                    }`}
                  />
                ))}
              </div>

              {/* Custom color picker */}
              <div className="flex items-center gap-2 pt-1">
                <div className="relative">
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                    title="Pick a custom color"
                  />
                </div>
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setCustomColor(v);
                  }}
                  className="flex-1 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-mono uppercase focus:outline-none focus:border-brand-blue-primary transition-colors"
                  maxLength={7}
                  placeholder="#000000"
                />
                <button
                  type="button"
                  onClick={() => setBackground(`custom:${customColor}`)}
                  disabled={!/^#([0-9a-fA-F]{3}){1,2}$/.test(customColor)}
                  className={`px-3 py-1.5 text-xxs font-bold uppercase rounded-lg transition-all ${
                    isCustomColorActive
                      ? 'bg-brand-blue-primary text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-brand-blue-primary hover:text-white disabled:opacity-50 disabled:hover:bg-slate-100 disabled:hover:text-slate-600'
                  }`}
                >
                  {isCustomColorActive ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    'Apply'
                  )}
                </button>
              </div>
            </div>

            {/* ── Patterns ── */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase">
                Patterns
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {patterns.map((bg) => (
                  <button
                    type="button"
                    key={bg.id}
                    onClick={() => setBackground(bg.id)}
                    className={`aspect-square rounded-lg border transition-all relative overflow-hidden ${
                      activeDashboard?.background === bg.id
                        ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className={`w-full h-full rounded-md ${bg.id}`} />
                    <div className="absolute bottom-0 inset-x-0 bg-black/40 py-0.5">
                      <span className="text-white text-xxxs font-bold uppercase block text-center">
                        {bg.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Gradients ── */}
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

              {/* Custom gradient creator */}
              <div className="space-y-2 pt-1">
                {/* Live preview */}
                <div
                  className={`w-full h-10 rounded-lg border transition-all ${
                    isCustomGradientActive
                      ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
                      : 'border-slate-200'
                  }`}
                  style={{
                    background: `linear-gradient(${gradientAngle}, ${gradientColor1}, ${gradientColor2})`,
                  }}
                />

                {/* Color pickers + direction */}
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={gradientColor1}
                    onChange={(e) => setGradientColor1(e.target.value)}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                    title="Start color"
                  />
                  <div className="flex-1 flex items-center justify-center gap-1 bg-slate-100 rounded-lg p-0.5">
                    {GRADIENT_DIRECTIONS.map(({ angle, label, icon: Icon }) => (
                      <button
                        type="button"
                        key={angle}
                        onClick={() => setGradientAngle(angle)}
                        title={label}
                        className={`p-1.5 rounded-md transition-all ${
                          gradientAngle === angle
                            ? 'bg-white shadow-sm text-brand-blue-primary'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                  <input
                    type="color"
                    value={gradientColor2}
                    onChange={(e) => setGradientColor2(e.target.value)}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                    title="End color"
                  />
                </div>

                {/* Apply button */}
                <button
                  type="button"
                  onClick={() =>
                    setBackground(`custom:${currentGradientValue}`)
                  }
                  className={`w-full py-1.5 text-xxs font-bold uppercase rounded-lg transition-all ${
                    isCustomGradientActive
                      ? 'bg-brand-blue-primary text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-brand-blue-primary hover:text-white'
                  }`}
                >
                  {isCustomGradientActive ? (
                    <span className="flex items-center justify-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Applied
                    </span>
                  ) : (
                    'Apply Gradient'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── My Uploads tab ── */}
      {designTab === 'my-uploads' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col gap-4 p-4 pb-4">
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

import React, { useRef } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, HotspotImageConfig, ImageHotspot } from '@/types';
import { useStorage } from '@/hooks/useStorage';
import { useAuth } from '@/context/useAuth';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { Button } from '@/components/common/Button';
import {
  Upload,
  Loader2,
  Trash2,
  Search,
  Info,
  HelpCircle,
  Star,
} from 'lucide-react';

const ICON_OPTIONS: {
  value: ImageHotspot['icon'];
  label: string;
  icon: React.ElementType;
}[] = [
  { value: 'search', label: 'Search', icon: Search },
  { value: 'info', label: 'Info', icon: Info },
  { value: 'question', label: 'Question', icon: HelpCircle },
  { value: 'star', label: 'Star', icon: Star },
];

export const HotspotImageSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast } = useDashboard();
  const { user } = useAuth();
  const config = widget.config as HotspotImageConfig;
  const { uploadFile, uploading } = useStorage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      addToast('Please upload an image file.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      addToast('Image is too large. Maximum size is 10MB.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      addToast('Uploading image...', 'info');
      const timestamp = Date.now();
      const path = `users/${user.uid}/hotspot_images/${timestamp}-${file.name}`;
      const url = await uploadFile(path, file);

      updateWidget(widget.id, {
        config: {
          ...config,
          baseImageUrl: url,
        },
      });
      addToast('Image uploaded successfully', 'success');
    } catch (err) {
      console.error('Image upload failed:', err);
      addToast('Failed to upload image', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageClick = (e: React.MouseEvent) => {
    if (!imageContainerRef.current) return;

    // We want the percentage relative to the actual image, but CSS max-width/height centers it.
    // The easiest robust way is to click on the constraint div.
    const rect = imageContainerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    // Create new hotspot, clamping to [0, 100]
    const clampedXPct = Math.max(0, Math.min(100, xPct));
    const clampedYPct = Math.max(0, Math.min(100, yPct));
    const newHotspot = {
      id: crypto.randomUUID(),
      xPct: clampedXPct,
      yPct: clampedYPct,
      title: 'New Hotspot',
      detailText: '',
      icon: 'info' as const,
      isViewed: false,
    };

    updateWidget(widget.id, {
      config: {
        ...config,
        hotspots: [...(config.hotspots ?? []), newHotspot],
      },
    });
  };

  const updateHotspot = (id: string, updates: Partial<ImageHotspot>) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        hotspots: (config.hotspots ?? []).map((h) =>
          h.id === id ? { ...h, ...updates } : h
        ),
      },
    });
  };

  const deleteHotspot = (id: string) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        hotspots: (config.hotspots ?? []).filter((h) => h.id !== id),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingsLabel>Base Image</SettingsLabel>

        {config.baseImageUrl && (
          <div className="mb-4">
            <p className="text-xs text-slate-500 mb-2">
              Click on the image to add a new pin.
            </p>
            <div
              ref={imageContainerRef}
              onClick={handleImageClick}
              className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center relative w-full cursor-crosshair"
              style={{ aspectRatio: 'auto' }} // Allows the image natural ratio
            >
              <img
                src={config.baseImageUrl}
                alt="Base"
                className="w-full h-auto object-contain block" // Fill width and calculate height naturally
              />
              {/* Show pins to help teacher */}
              {config.hotspots?.map((spot) => (
                <div
                  key={spot.id}
                  className="absolute w-4 h-4 rounded-full bg-blue-500 border-2 border-white transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${spot.xPct}%`, top: `${spot.yPct}%` }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex justify-center items-center gap-2"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading
              ? 'Uploading...'
              : config.baseImageUrl
                ? 'Replace Image'
                : 'Upload Image'}
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {config.baseImageUrl && (
        <div>
          <SettingsLabel>
            Interactive Pins ({config.hotspots?.length ?? 0})
          </SettingsLabel>
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
            {config.hotspots?.map((spot, i) => (
              <div
                key={spot.id}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 relative"
              >
                <button
                  type="button"
                  aria-label={`Delete hotspot ${spot.title || i + 1}`}
                  onClick={() => deleteHotspot(spot.id)}
                  className="absolute top-3 right-3 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                    Title (Pin {i + 1})
                  </label>
                  <input
                    type="text"
                    value={spot.title}
                    onChange={(e) =>
                      updateHotspot(spot.id, { title: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="Hotspot Title"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                    Detail Text
                  </label>
                  <textarea
                    value={spot.detailText}
                    onChange={(e) =>
                      updateHotspot(spot.id, { detailText: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[80px]"
                    placeholder="Provide details, guiding questions, or facts..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">
                    Icon
                  </label>
                  <div className="flex gap-2">
                    {ICON_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() =>
                          updateHotspot(spot.id, {
                            icon: opt.value,
                          })
                        }
                        className={`p-2 rounded-md transition-colors border ${
                          spot.icon === opt.value
                            ? 'bg-blue-50 border-blue-200 text-blue-600'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                        title={opt.label}
                      >
                        <opt.icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {(!config.hotspots || config.hotspots.length === 0) && (
              <p className="text-sm text-slate-500 text-center py-4 bg-slate-50 border border-slate-200 border-dashed rounded-lg">
                Click on the image above to add pins.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const HotspotImageAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as HotspotImageConfig;

  if (!config.baseImageUrl) {
    return (
      <p className="text-sm text-slate-500 italic">
        Upload an image first to configure appearance options.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <SettingsLabel>Popover Theme</SettingsLabel>
        <div className="flex gap-2">
          {[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'glass', label: 'Glass' },
          ].map((theme) => (
            <button
              key={theme.value}
              onClick={() =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    popoverTheme: theme.value as 'light' | 'dark' | 'glass',
                  },
                })
              }
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all border ${
                (config.popoverTheme ?? 'light') === theme.value
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

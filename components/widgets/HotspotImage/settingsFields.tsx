import React, { useRef } from 'react';
import {
  HelpCircle,
  Info,
  Loader2,
  Search,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useStorage } from '@/hooks/useStorage';
import type {
  HotspotImageConfig,
  HotspotSavedItem,
  ImageHotspot,
} from '@/types';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { tourAttr } from '@/config/tourAnchors';

const ICON_OPTIONS: ReadonlyArray<{
  value: ImageHotspot['icon'];
  label: string;
  icon: React.ElementType;
}> = [
  { value: 'search', label: 'iconSearch', icon: Search },
  { value: 'info', label: 'iconInfo', icon: Info },
  { value: 'question', label: 'iconQuestion', icon: HelpCircle },
  { value: 'star', label: 'iconStar', icon: Star },
];

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue-primary';

const getConfig = (ctx: CustomRenderCtx): HotspotImageConfig =>
  ctx.config as unknown as HotspotImageConfig;

const HotspotBaseImageField: React.FC<{ ctx: CustomRenderCtx }> = ({ ctx }) => {
  const { addToast } = useDashboard();
  const { user, savedWidgetPresets, saveWidgetPreset } = useAuth();
  const { uploadHotspotImage, uploading } = useStorage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const config = getConfig(ctx);
  const baseImageUrl = config.baseImageUrl ?? '';
  const hotspots = config.hotspots ?? [];
  const savedLibrary =
    (
      savedWidgetPresets['hotspot-image'] as
        | Partial<HotspotImageConfig>
        | undefined
    )?.savedLibrary ?? [];
  const t = (leaf: string) => ctx.t(`widgetSettings.hotspot-image.${leaf}`);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      addToast(t('imageInvalidType'), 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast(t('imageTooLarge'), 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      addToast(t('uploading'), 'info');
      const url = await uploadHotspotImage(user.uid, file);
      ctx.updateConfig({ baseImageUrl: url });
      addToast(t('uploadSuccess'), 'success');
    } catch (error) {
      console.error('[HotspotImage] Image upload failed:', error);
      addToast(t('imageUploadFailed'), 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageClick = (event: React.MouseEvent) => {
    const container = imageContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const xPct = Math.max(
      0,
      Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)
    );
    const yPct = Math.max(
      0,
      Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)
    );
    const newHotspot: ImageHotspot = {
      id: crypto.randomUUID(),
      xPct,
      yPct,
      title: t('newHotspot'),
      detailText: '',
      icon: 'info',
      isViewed: false,
    };
    ctx.updateConfig({ hotspots: [...hotspots, newHotspot] });
  };

  const handleSaveToLibrary = () => {
    if (!baseImageUrl) return;
    const name = window.prompt(t('savePrompt'));
    if (!name) return;
    const newItem: HotspotSavedItem = {
      id: crypto.randomUUID(),
      name,
      baseImageUrl,
      hotspots,
      popoverTheme: config.popoverTheme,
      createdAt: Date.now(),
    };
    saveWidgetPreset('hotspot-image', {
      savedLibrary: [...savedLibrary, newItem],
    });
    addToast(t('savedToLibrary'), 'success');
  };

  const handleLoadFromLibrary = (item: HotspotSavedItem) => {
    ctx.updateConfig({
      baseImageUrl: item.baseImageUrl,
      hotspots: item.hotspots,
      popoverTheme: item.popoverTheme,
    });
    addToast(t('loadedFromLibrary'), 'success');
  };

  const handleDeleteFromLibrary = (id: string) => {
    if (!window.confirm(t('deletePrompt'))) return;
    saveWidgetPreset('hotspot-image', {
      savedLibrary: savedLibrary.filter((item) => item.id !== id),
    });
    addToast(t('deletedFromLibrary'), 'info');
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-2"
    >
      {baseImageUrl && (
        <div className="mb-2">
          <p className="mb-2 text-xxs text-slate-600">{t('clickToAddPin')}</p>
          <div
            ref={imageContainerRef}
            onClick={handleImageClick}
            className="relative flex w-full cursor-crosshair items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
          >
            <img
              src={baseImageUrl}
              alt={t('baseImageAlt')}
              className="block h-auto w-full object-contain"
            />
            {hotspots.map((spot) => (
              <div
                key={spot.id}
                aria-hidden="true"
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 transform rounded-full border-2 border-white bg-blue-500"
                style={{ left: `${spot.xPct}%`, top: `${spot.yPct}%` }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2"
          {...tourAttr(
            'widget-settings.hotspot-image.upload',
            ctx.widget.id,
            ctx.widget.type
          )}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="h-4 w-4" aria-hidden="true" />
          )}
          {uploading
            ? t('uploading')
            : baseImageUrl
              ? t('replaceImage')
              : t('uploadImage')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={t('uploadImage')}
          onChange={(event) => void handleFileChange(event)}
        />
      </div>

      <div className="mt-2 space-y-2">
        <p className="text-xs font-semibold text-slate-700">
          {t('savedLibrary')}
        </p>
        {savedLibrary.length > 0 ? (
          <div className="max-h-40 space-y-2 overflow-y-auto pr-2">
            {savedLibrary.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-2"
              >
                <button
                  type="button"
                  onClick={() => handleLoadFromLibrary(item)}
                  className="mr-2 min-w-0 flex-1 truncate text-left text-xs font-medium text-slate-700 hover:text-brand-blue-primary"
                >
                  {item.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteFromLibrary(item.id)}
                  className="p-1 text-slate-600 hover:text-brand-red-primary"
                  aria-label={t('deleteSavedHotspot')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xxs italic text-slate-600">
            {t('noSavedHotspots')}
          </p>
        )}
        {baseImageUrl && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleSaveToLibrary}
            className="w-full text-xs"
            {...tourAttr(
              'widget-settings.hotspot-image.save-library',
              ctx.widget.id,
              ctx.widget.type
            )}
          >
            {t('saveCurrentToLibrary')}
          </Button>
        )}
      </div>
    </div>
  );
};

export const HotspotImageBaseField: React.FC<{ ctx: CustomRenderCtx }> = (
  props
) => <HotspotBaseImageField {...props} />;

export const HotspotImagePinsField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const config = getConfig(ctx);
  const hotspots = config.hotspots ?? [];
  const t = (leaf: string) => ctx.t(`widgetSettings.hotspot-image.${leaf}`);

  const updateHotspot = (id: string, updates: Partial<ImageHotspot>) => {
    ctx.updateConfig({
      hotspots: hotspots.map((hotspot) =>
        hotspot.id === id ? { ...hotspot, ...updates } : hotspot
      ),
    });
  };

  const deleteHotspot = (id: string) => {
    ctx.updateConfig({
      hotspots: hotspots.filter((hotspot) => hotspot.id !== id),
    });
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-1"
    >
      {hotspots.map((hotspot, index) => (
        <div
          key={hotspot.id}
          className="relative space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <button
            type="button"
            aria-label={t('deleteHotspot').replace(
              '{{count}}',
              String(index + 1)
            )}
            onClick={() => deleteHotspot(hotspot.id)}
            className="absolute right-3 top-3 text-slate-600 hover:text-brand-red-primary"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <label
            htmlFor={`${ctx.id}-title-${hotspot.id}`}
            className="block text-xxs font-semibold uppercase tracking-wider text-slate-600"
          >
            {t('pinTitle').replace('{{count}}', String(index + 1))}
          </label>
          <input
            id={`${ctx.id}-title-${hotspot.id}`}
            type="text"
            value={hotspot.title}
            onChange={(event) =>
              updateHotspot(hotspot.id, { title: event.target.value })
            }
            className={inputClass}
            placeholder={t('pinTitlePlaceholder')}
          />
          <label
            htmlFor={`${ctx.id}-detail-${hotspot.id}`}
            className="block text-xxs font-semibold uppercase tracking-wider text-slate-600"
          >
            {t('detailText')}
          </label>
          <textarea
            id={`${ctx.id}-detail-${hotspot.id}`}
            value={hotspot.detailText}
            onChange={(event) =>
              updateHotspot(hotspot.id, { detailText: event.target.value })
            }
            className={`${inputClass} min-h-20`}
            placeholder={t('detailPlaceholder')}
          />
          <span className="block text-xxs font-semibold uppercase tracking-wider text-slate-600">
            {t('icon')}
          </span>
          <div
            role="radiogroup"
            aria-label={t('icon')}
            className="flex gap-2"
            onKeyDown={(event) =>
              handleRadioGroupKeyDown(event, ICON_OPTIONS, (option) =>
                updateHotspot(hotspot.id, { icon: option.value })
              )
            }
          >
            {ICON_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = hotspot.icon === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  aria-label={t(option.label)}
                  onClick={() =>
                    updateHotspot(hotspot.id, { icon: option.value })
                  }
                  className={`rounded-md border p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue-primary ${selected ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {hotspots.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-4 text-center text-xs text-slate-600">
          {t('clickToAddPin')}
        </p>
      )}
    </div>
  );
};

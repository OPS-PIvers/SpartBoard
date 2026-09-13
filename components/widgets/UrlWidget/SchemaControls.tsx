import React, { useEffect, useRef, useState } from 'react';
import { WidgetData, UrlWidgetConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useStorage } from '@/hooks/useStorage';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { isSafeIconUrl } from '@/components/widgets/Catalyst/catalystHelpers';
import {
  URL_ICONS,
  DEFAULT_URL_ICON_ID,
  DEFAULT_URL_COLOR,
  getUrlIcon,
} from './icons';
import { LinkBackgroundInput } from './LinkBackgroundInput';
import { LinkShapePicker, type LinkShape } from './LinkShapePicker';

const IconPicker: React.FC<{
  iconId: string;
  onChange: (next: string) => void;
}> = ({ iconId, onChange }) => (
  <div className="grid grid-cols-10 gap-1.5 max-h-32 overflow-y-auto p-1">
    {URL_ICONS.map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        title={label}
        aria-label={label}
        aria-pressed={iconId === id}
        className={`flex items-center justify-center w-8 h-8 rounded-lg border-2 transition-all ${
          iconId === id
            ? 'border-slate-800 bg-slate-800 text-white scale-105'
            : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
      >
        <Icon className="w-4 h-4" />
      </button>
    ))}
  </div>
);

export const UrlWidgetSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { deleteFile } = useStorage();
  const config = widget.config as UrlWidgetConfig;
  const urls = config.urls ?? [];

  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState<string>(DEFAULT_URL_COLOR);
  const [newImageUrl, setNewImageUrl] = useState<string | undefined>(undefined);
  const [newIcon, setNewIcon] = useState(DEFAULT_URL_ICON_ID);
  const [newShape, setNewShape] = useState<LinkShape>('rectangle');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Track an "Add New Link" image upload that has not yet been committed via
  // the Add Link button. If the panel unmounts (settings flipped, widget
  // closed) while an uncommitted image is staged, delete it on the way out
  // so we don't leak orphaned blobs in Drive/Storage.
  const uncommittedImageRef = useRef<string | undefined>(undefined);
  const deleteFileRef = useRef(deleteFile);
  useEffect(() => {
    deleteFileRef.current = deleteFile;
  }, [deleteFile]);
  useEffect(() => {
    uncommittedImageRef.current = newImageUrl;
  }, [newImageUrl]);
  useEffect(() => {
    return () => {
      const orphan = uncommittedImageRef.current;
      if (orphan) {
        void deleteFileRef.current(orphan).catch((err) => {
          console.warn(
            '[UrlWidgetSettings] Failed to clean up uncommitted image upload.',
            err
          );
        });
      }
    };
  }, []);

  const update = (updates: Partial<UrlWidgetConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  const getDisplayLabel = (title?: string, url?: string) => {
    const trimmedTitle = title?.trim();
    return trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : url;
  };

  const addUrl = () => {
    if (!newUrl.trim()) return;

    let formattedUrl = newUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const newItem = {
      id: crypto.randomUUID(),
      url: formattedUrl,
      title: newTitle.trim() || undefined,
      color: newColor,
      icon: newIcon,
      shape: newShape,
      imageUrl: newImageUrl,
    };

    // Mark the staged image as committed BEFORE clearing state, so the
    // unmount-cleanup effect can never race with us and delete a file we
    // just persisted into the widget config.
    uncommittedImageRef.current = undefined;
    update({ urls: [...urls, newItem] });
    setNewUrl('');
    setNewTitle('');
    setNewImageUrl(undefined);
  };

  const removeUrl = (id: string) => {
    const removed = urls.find((u) => u.id === id);
    update({ urls: urls.filter((u) => u.id !== id) });
    if (expandedId === id) setExpandedId(null);
    // Drop the link's uploaded background image too — otherwise it lingers
    // as an orphaned blob in Drive/Storage every time someone removes a link.
    if (removed?.imageUrl) {
      void deleteFile(removed.imageUrl).catch((err) => {
        console.warn(
          '[UrlWidgetSettings] Failed to delete removed link image.',
          err
        );
      });
    }
  };

  const patchUrl = (
    id: string,
    patch: Partial<UrlWidgetConfig['urls'][number]>
  ) => {
    update({
      urls: urls.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    });
  };

  return (
    <div className="p-4 space-y-6">
      {/* Add New URL Section */}
      <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
        <h3 className="text-sm font-bold text-slate-700">Add New Link</h3>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
            URL
          </label>
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
            placeholder="e.g. google.com"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
            Title (Optional)
          </label>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
            placeholder="e.g. Google"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
            Shape
          </label>
          <LinkShapePicker shape={newShape} onChange={setNewShape} />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
            Icon
          </label>
          <IconPicker iconId={newIcon} onChange={setNewIcon} />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
            Background
          </label>
          <LinkBackgroundInput
            color={newColor}
            imageUrl={newImageUrl}
            onChange={({ color, imageUrl }) => {
              if (color !== undefined) setNewColor(color);
              setNewImageUrl(imageUrl);
            }}
          />
        </div>

        <button
          type="button"
          onClick={addUrl}
          disabled={!newUrl.trim()}
          className="w-full mt-2 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-bold transition-colors"
        >
          <Plus size={16} />
          Add Link
        </button>
      </div>

      {/* Existing URLs List */}
      {urls.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-700">Active Links</h3>
          <div className="space-y-2">
            {urls.map((u) => {
              const Icon = getUrlIcon(u.icon);
              const isExpanded = expandedId === u.id;
              const shape: LinkShape = u.shape ?? 'rectangle';
              const safeImage =
                u.imageUrl && isSafeIconUrl(u.imageUrl)
                  ? u.imageUrl
                  : undefined;
              const previewBg = safeImage
                ? undefined
                : (u.color ?? DEFAULT_URL_COLOR);
              return (
                <div
                  key={u.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between p-3 gap-2">
                    <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                      <div
                        className={`w-8 h-8 ${shape === 'circle' ? 'rounded-full' : 'rounded-lg'} flex items-center justify-center flex-shrink-0 overflow-hidden`}
                        style={
                          previewBg ? { backgroundColor: previewBg } : undefined
                        }
                      >
                        {safeImage ? (
                          <img
                            src={safeImage}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Icon className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="font-bold text-sm text-slate-800 truncate">
                          {getDisplayLabel(u.title, u.url)}
                        </span>
                        <span className="text-xs text-slate-500 truncate">
                          {u.url}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : u.id)}
                      className="p-2 text-slate-400 hover:text-brand-blue-primary hover:bg-blue-50 rounded-lg transition-colors"
                      title={isExpanded ? 'Collapse' : 'Edit'}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeUrl(u.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove Link"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-slate-100 p-3 space-y-4 bg-slate-50">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
                          Title
                        </label>
                        <input
                          type="text"
                          value={u.title ?? ''}
                          onChange={(e) =>
                            patchUrl(u.id, {
                              title: e.target.value || undefined,
                            })
                          }
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
                          placeholder="Link title"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
                          Shape
                        </label>
                        <LinkShapePicker
                          shape={shape}
                          onChange={(next) => patchUrl(u.id, { shape: next })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
                          Icon
                        </label>
                        <IconPicker
                          iconId={u.icon ?? DEFAULT_URL_ICON_ID}
                          onChange={(id) => patchUrl(u.id, { icon: id })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
                          Background
                        </label>
                        <LinkBackgroundInput
                          color={u.color}
                          imageUrl={u.imageUrl}
                          onChange={({ color, imageUrl }) =>
                            patchUrl(u.id, {
                              color: color ?? u.color,
                              imageUrl,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  CatalystRoutine,
  CatalystCategory,
  WidgetType,
  WidgetConfig,
} from '../../../types';
import { TOOLS } from '../../../config/tools';
import { Plus, Trash2, Upload, Loader2 } from 'lucide-react';
import { Modal } from '../../common/Modal';
import { Button } from '../../common/Button';
import { IconPicker } from './IconPicker';

interface RoutineEditorProps {
  routine: CatalystRoutine | null;
  routines: CatalystRoutine[];
  categories: CatalystCategory[];
  onSave: (routine: CatalystRoutine) => void;
  onCancel: () => void;
  onShowMessage: (type: 'success' | 'error', text: string) => void;
  onUploadImage: (file: File) => Promise<string>;
}

// Derive widget types from TOOLS registry, excluding catalyst-related widgets and internal tools
const WIDGET_TYPES: WidgetType[] = TOOLS.filter(
  (tool) =>
    !tool.type.startsWith('catalyst') &&
    tool.type !== 'instructionalRoutines' &&
    tool.type !== 'record' &&
    tool.type !== 'magic'
).map((tool) => tool.type as WidgetType);

/**
 * Validates and sanitizes parsed JSON to prevent prototype pollution.
 */
const sanitizeJsonConfig = (parsed: unknown): WidgetConfig | null => {
  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]';

  if (!isPlainObject(parsed)) {
    return null;
  }

  const dangerous = ['__proto__', 'constructor', 'prototype'];

  const sanitizeValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item));
    }
    if (isPlainObject(value)) {
      return sanitizeObject(value);
    }
    return value;
  };

  const sanitizeObject = (
    obj: Record<string, unknown>
  ): Record<string, unknown> => {
    const result = Object.create(null) as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (dangerous.includes(key)) continue;
      result[key] = sanitizeValue(value);
    }
    return result;
  };

  const sanitized = sanitizeObject(parsed);
  return sanitized as WidgetConfig;
};

export const RoutineEditor: React.FC<RoutineEditorProps> = ({
  routine,
  routines,
  categories,
  onSave,
  onCancel,
  onShowMessage,
  onUploadImage,
}) => {
  const [editingRoutine, setEditingRoutine] = useState<CatalystRoutine | null>(
    null
  );
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [jsonTexts, setJsonTexts] = useState<Record<string, string>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditingRoutine(routine);
    setJsonErrors({});
    setJsonTexts({});
  }, [routine]);

  if (!editingRoutine) return null;

  const isNew = !routines.find((r) => r.id === editingRoutine.id);

  const handleSave = () => {
    if (Object.keys(jsonErrors).length > 0) {
      onShowMessage('error', 'Please fix JSON errors before saving.');
      return;
    }
    if (
      !editingRoutine.category ||
      !categories.find((c) => c.id === editingRoutine.category)
    ) {
      onShowMessage('error', 'Please select a valid category before saving.');
      return;
    }
    onSave(editingRoutine);
  };

  const handleJsonChange = (id: string, text: string) => {
    setJsonTexts((prev) => ({ ...prev, [id]: text }));
    try {
      const parsed = JSON.parse(text) as unknown;
      const sanitized = sanitizeJsonConfig(parsed);
      if (sanitized === null) {
        setJsonErrors((prev) => ({ ...prev, [id]: 'Must be an object' }));
        return;
      }
      const newWidgets = (editingRoutine.associatedWidgets ?? []).map((w) =>
        w.id === id ? { ...w, config: sanitized } : w
      );
      setEditingRoutine({ ...editingRoutine, associatedWidgets: newWidgets });
      setJsonErrors((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    } catch (_e) {
      setJsonErrors((prev) => ({ ...prev, [id]: 'Invalid JSON format' }));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingRoutine) return;

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) {
      onShowMessage('error', 'Image must be under 5 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadingImage(true);
    try {
      const url = await onUploadImage(file);
      setEditingRoutine({ ...editingRoutine, icon: url });
    } catch (error) {
      console.error('Image upload failed:', error);
      onShowMessage('error', 'Image upload failed. Please try again.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title={isNew ? 'New Routine' : 'Edit Routine'}
      zIndex="z-modal-deep"
      maxWidth="max-w-2xl"
      footer={
        <div className="flex gap-2 justify-end w-full">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
            Title
          </label>
          <input
            type="text"
            value={editingRoutine.title}
            onChange={(e) =>
              setEditingRoutine({ ...editingRoutine, title: e.target.value })
            }
            className="w-full border border-slate-300 rounded px-3 py-2"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
            Category
          </label>
          <select
            value={editingRoutine.category}
            onChange={(e) =>
              setEditingRoutine({ ...editingRoutine, category: e.target.value })
            }
            className="w-full border border-slate-300 rounded px-3 py-2"
          >
            <option value="">Select Category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
            Short Description
          </label>
          <input
            type="text"
            value={editingRoutine.shortDesc}
            onChange={(e) =>
              setEditingRoutine({
                ...editingRoutine,
                shortDesc: e.target.value,
              })
            }
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="col-span-2">
          <IconPicker
            value={editingRoutine.icon}
            onChange={(val) =>
              setEditingRoutine({ ...editingRoutine, icon: val })
            }
          />
          {/* Image upload — sets icon to the uploaded image URL */}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-indigo-400 hover:bg-indigo-50 transition-colors disabled:opacity-50"
            >
              {uploadingImage ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload size={13} />
                  Upload image as icon
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </div>
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
            Teacher Instructions
          </label>
          <textarea
            value={editingRoutine.instructions}
            onChange={(e) =>
              setEditingRoutine({
                ...editingRoutine,
                instructions: e.target.value,
              })
            }
            rows={4}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="col-span-2 border-t border-slate-200 pt-4 mt-2">
          <label className="block text-xs font-black uppercase text-indigo-600 mb-2">
            Associated Widgets (Go Mode)
          </label>
          <div className="space-y-3">
            {(editingRoutine.associatedWidgets ?? []).map((aw) => (
              <div
                key={aw.id}
                className="flex flex-col gap-2 p-3 bg-slate-50 rounded border border-slate-200"
              >
                <div className="flex gap-2 items-center">
                  <select
                    value={aw.type}
                    onChange={(e) => {
                      const newType = e.target.value as WidgetType;
                      const newWidgets = (
                        editingRoutine.associatedWidgets ?? []
                      ).map((w) =>
                        w.id === aw.id
                          ? { id: w.id, type: newType, config: undefined }
                          : w
                      );
                      setEditingRoutine({
                        ...editingRoutine,
                        associatedWidgets: newWidgets,
                      });
                    }}
                    className="border border-slate-300 rounded px-2 py-1 text-sm bg-white"
                  >
                    {WIDGET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const newWidgets = (
                        editingRoutine.associatedWidgets ?? []
                      ).filter((w) => w.id !== aw.id);
                      setEditingRoutine({
                        ...editingRoutine,
                        associatedWidgets: newWidgets,
                      });
                    }}
                    className="p-1 text-slate-400 hover:text-red-500 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xxs font-black uppercase text-slate-400">
                      Config (JSON)
                    </label>
                    {jsonErrors[aw.id] && (
                      <span className="text-xxs font-bold text-red-500">
                        {jsonErrors[aw.id]}
                      </span>
                    )}
                  </div>
                  <textarea
                    value={jsonTexts[aw.id] ?? JSON.stringify(aw.config ?? {})}
                    onChange={(e) => handleJsonChange(aw.id, e.target.value)}
                    rows={2}
                    className={`w-full border rounded px-2 py-1 text-xs font-mono ${
                      jsonErrors[aw.id] ? 'border-red-300' : 'border-slate-300'
                    }`}
                    placeholder="{}"
                  />
                </div>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() =>
                setEditingRoutine({
                  ...editingRoutine,
                  associatedWidgets: [
                    ...(editingRoutine.associatedWidgets ?? []),
                    {
                      id: crypto.randomUUID(),
                      type: 'timer' as WidgetType,
                      config: undefined,
                    },
                  ],
                })
              }
            >
              Add Widget
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

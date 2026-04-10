import React from 'react';
import {
  Video,
  Pencil,
  Check,
  X,
  Tag,
  Plus,
  Trash2,
  Building2,
  Star,
} from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { BUILDINGS } from '@/config/buildings';
import { extractYouTubeId } from '@/utils/youtube';
import { PresetCardProps } from './types';
import { AccessLevel } from '@/types';

export const ListPresetRow: React.FC<PresetCardProps> = ({
  preset,
  editingId,
  editName,
  editingCategoryPresetId,
  editingCategoryValue,
  allCategories,
  setEditingId,
  setEditName,
  setEditingCategoryPresetId,
  setEditingCategoryValue,
  updatePreset,
  clearPresetCategory,
  deletePreset,
  addBetaUser,
  removeBetaUser,
  toggleBuildingId,
  toggleFeatured,
  getAccessLevelIcon,
  getAccessLevelColor,
}) => {
  const isVideo = Boolean(extractYouTubeId(preset.url));

  return (
    <div className="bg-white border-2 border-slate-200 rounded-xl hover:border-brand-blue-light transition-colors overflow-hidden">
      <div className="flex items-center gap-2 lg:gap-3 p-3">
        {/* Thumbnail */}
        <div className="relative w-16 lg:w-20 h-12 lg:h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0">
          <img
            src={preset.thumbnailUrl ?? preset.url}
            alt={preset.label}
            className="w-full h-full object-cover"
          />
          {isVideo && (
            <div className="absolute top-0.5 left-0.5 flex items-center gap-0.5 bg-red-600 text-white rounded px-1 py-0.5">
              <Video className="w-2.5 h-2.5" />
            </div>
          )}
        </div>

        {/* Label */}
        <div className="w-32 xl:w-44 shrink-0 min-w-0">
          {editingId === preset.id ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 px-2 py-1 text-xs border border-brand-blue-light rounded focus:outline-none focus:ring-1 focus:ring-brand-blue-primary"
                autoFocus
              />
              <button
                onClick={() => {
                  if (editName.trim()) {
                    void updatePreset(preset.id, { label: editName.trim() });
                  }
                  setEditingId(null);
                }}
                className="p-1 text-green-600 hover:bg-green-50 rounded"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span
                className="text-sm font-bold text-slate-800 truncate"
                title={preset.label}
              >
                {preset.label}
              </span>
              <button
                onClick={() => {
                  setEditingId(preset.id);
                  setEditName(preset.label);
                }}
                className="p-1 text-slate-400 hover:text-brand-blue-primary rounded shrink-0"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-8 bg-slate-100" />

        {/* Active Toggle */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className="text-xxs font-bold text-slate-400 uppercase">
            Active
          </span>
          <Toggle
            checked={preset.active}
            onChange={(checked) =>
              void updatePreset(preset.id, { active: checked })
            }
            size="sm"
            activeColor="bg-green-500"
          />
        </div>

        <div className="w-px h-8 bg-slate-100" />

        {/* Access Level */}
        <div className="flex items-center gap-1 shrink-0">
          {(['admin', 'beta', 'public'] as AccessLevel[]).map((level) => (
            <button
              key={level}
              onClick={() =>
                void updatePreset(preset.id, { accessLevel: level })
              }
              className={`px-2 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1 transition-all ${
                preset.accessLevel === level
                  ? getAccessLevelColor(level)
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
              title={`Set to ${level}`}
            >
              {getAccessLevelIcon(level)}
              <span className="capitalize">{level}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-8 bg-slate-100" />

        {/* Category */}
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {editingCategoryPresetId === preset.id ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                type="text"
                value={editingCategoryValue}
                onChange={(e) => setEditingCategoryValue(e.target.value)}
                list={`cats-${preset.id}`}
                placeholder="Category..."
                className="flex-1 px-2 py-1 text-xs border border-brand-blue-light rounded focus:outline-none focus:ring-1 focus:ring-brand-blue-primary min-w-0"
                autoFocus
              />
              <datalist id={`cats-${preset.id}`}>
                {allCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
              <button
                onClick={() => {
                  const trimmed = editingCategoryValue.trim();
                  if (trimmed) {
                    void updatePreset(preset.id, { category: trimmed });
                  } else {
                    void clearPresetCategory(preset.id);
                  }
                  setEditingCategoryPresetId(null);
                  setEditingCategoryValue('');
                }}
                className="p-1 text-green-600 hover:bg-green-50 rounded shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setEditingCategoryPresetId(null);
                  setEditingCategoryValue('');
                }}
                className="p-1 text-red-500 hover:bg-red-50 rounded shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setEditingCategoryPresetId(preset.id);
                setEditingCategoryValue(preset.category ?? '');
              }}
              className="text-xs text-slate-500 hover:text-brand-blue-primary truncate"
            >
              {preset.category ?? (
                <span className="italic text-slate-300">No category</span>
              )}
            </button>
          )}
        </div>

        <div className="w-px h-8 bg-slate-100" />

        {/* Building Assignment */}
        <div className="flex items-center gap-1 shrink-0">
          <Building2 className="w-3.5 h-3.5 text-slate-400" />
          {BUILDINGS.map((b) => {
            const assigned = (preset.buildingIds ?? []).includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => void toggleBuildingId(preset.id, b.id)}
                className={`px-2 py-1 rounded-md text-xxs font-bold border transition-all ${
                  assigned
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                }`}
                title={`${assigned ? 'Remove from' : 'Assign to'} ${b.name}`}
              >
                {b.gradeLabel}
              </button>
            );
          })}
          {(preset.buildingIds ?? []).length === 0 && (
            <span className="text-xxs text-slate-400 italic">All</span>
          )}
        </div>

        {/* Featured */}
        <button
          type="button"
          onClick={() => void toggleFeatured(preset.id)}
          className={`p-1.5 rounded-lg transition-colors shrink-0 ${
            preset.featured
              ? 'text-amber-500 hover:bg-amber-50'
              : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'
          }`}
          title={preset.featured ? 'Remove from featured' : 'Mark as featured'}
          aria-label={
            preset.featured ? 'Remove from featured' : 'Mark as featured'
          }
        >
          <Star
            className="w-4 h-4"
            fill={preset.featured ? 'currentColor' : 'none'}
          />
        </button>

        {/* Delete */}
        <button
          onClick={() => void deletePreset(preset)}
          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0 ml-1"
          title="Delete background"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Beta Users expanded row */}
      {preset.accessLevel === 'beta' && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <label className="text-xxs font-black text-slate-400 uppercase tracking-widest mb-2 block">
            Beta Users
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {preset.betaUsers.map((email) => (
              <div
                key={email}
                className="flex items-center gap-1.5 px-2 py-0.5 bg-white border border-blue-100 rounded-full text-xs text-slate-700"
              >
                {email}
                <button
                  onClick={() => void removeBetaUser(preset.id, email)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <form
            className="flex gap-2 max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem(
                'betaEmail'
              ) as HTMLInputElement;
              void addBetaUser(preset.id, input.value);
              input.value = '';
            }}
          >
            <input
              name="betaEmail"
              type="email"
              placeholder="Add email..."
              className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue-primary"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-xs"
            >
              <Plus className="w-3 h-3" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

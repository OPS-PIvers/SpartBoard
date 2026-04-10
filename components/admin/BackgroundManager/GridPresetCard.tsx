import React from 'react';
import { Video, Pencil, Check, X, Tag, Plus, Trash2, Star } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { BUILDINGS } from '@/config/buildings';
import { extractYouTubeId } from '@/utils/youtube';
import { PresetCardProps } from './types';
import { AccessLevel } from '@/types';

export const GridPresetCard: React.FC<PresetCardProps> = ({
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
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-brand-blue-light transition-all flex flex-col h-auto">
      {/* Image Preview */}
      <div className="relative h-[120px] bg-slate-100 group shrink-0">
        <img
          src={preset.thumbnailUrl ?? preset.url}
          alt={preset.label}
          className="w-full h-full object-cover"
        />
        {isVideo && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-red-600 text-white rounded px-1.5 py-0.5">
            <Video className="w-3 h-3" />
            <span className="text-xxxs font-black uppercase tracking-wide">
              Video
            </span>
          </div>
        )}
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
          <button
            onClick={() => void toggleFeatured(preset.id)}
            className={`p-1.5 rounded-lg shadow-md transition-all scale-90 hover:scale-100 ${
              preset.featured
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-white/80 text-slate-400 hover:bg-amber-500 hover:text-white'
            }`}
            title={
              preset.featured ? 'Remove from featured' : 'Mark as featured'
            }
          >
            <Star
              className="w-3.5 h-3.5"
              fill={preset.featured ? 'currentColor' : 'none'}
            />
          </button>
          <button
            onClick={() => void deletePreset(preset)}
            className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-md transition-all scale-90 hover:scale-100"
            title="Delete background"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xxs font-black uppercase text-white">
            Active
          </span>
          <Toggle
            checked={preset.active}
            onChange={(checked) =>
              void updatePreset(preset.id, { active: checked })
            }
            size="xs"
            activeColor="bg-green-500"
            showLabels={false}
            variant="transparent"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="p-2.5 flex-1 flex flex-col min-h-0 gap-2">
        {/* Label Editing */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          {editingId === preset.id ? (
            <div className="flex items-center gap-1.5 flex-1">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 px-2 py-1 text-xs border border-brand-blue-light rounded focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
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
            <>
              <h4
                className="font-bold text-slate-800 truncate text-xs"
                title={preset.label}
              >
                {preset.label}
              </h4>
              <button
                onClick={() => {
                  setEditingId(preset.id);
                  setEditName(preset.label);
                }}
                className="p-1 text-slate-400 hover:text-brand-blue-primary rounded transition-colors shrink-0"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </>
          )}
        </div>

        {/* Access Level */}
        <div className="shrink-0">
          <label className="text-xxs font-black text-slate-400 uppercase tracking-widest mb-1 block">
            Access Level
          </label>
          <div className="flex gap-1">
            {(['admin', 'beta', 'public'] as AccessLevel[]).map((level) => (
              <button
                key={level}
                onClick={() =>
                  void updatePreset(preset.id, { accessLevel: level })
                }
                className={`flex-1 py-1 rounded-[4px] text-xxxs font-black uppercase flex items-center justify-center gap-1 transition-all ${
                  preset.accessLevel === level
                    ? getAccessLevelColor(level)
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-100'
                }`}
                title={`Set to ${level}`}
              >
                {getAccessLevelIcon(level)}
                <span className="hidden sm:inline">{level}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category */}
        <div className="shrink-0">
          <label className="text-xxs font-black text-slate-400 uppercase tracking-widest mb-1 block">
            Category
          </label>
          {editingCategoryPresetId === preset.id ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={editingCategoryValue}
                onChange={(e) => setEditingCategoryValue(e.target.value)}
                list={`cats-grid-${preset.id}`}
                placeholder="Category..."
                className="flex-1 px-2 py-1 text-xs border border-brand-blue-light rounded focus:outline-none focus:ring-1 focus:ring-brand-blue-primary min-w-0"
                autoFocus
              />
              <datalist id={`cats-grid-${preset.id}`}>
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
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  setEditingCategoryPresetId(null);
                  setEditingCategoryValue('');
                }}
                className="p-1 text-red-500 hover:bg-red-50 rounded shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setEditingCategoryPresetId(preset.id);
                setEditingCategoryValue(preset.category ?? '');
              }}
              className="flex items-center gap-1.5 w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-xs text-slate-500 hover:border-brand-blue-light hover:text-brand-blue-primary transition-colors text-left"
            >
              <Tag className="w-3 h-3" />
              <span className="truncate">
                {preset.category ?? (
                  <span className="italic text-slate-300">No category</span>
                )}
              </span>
            </button>
          )}
        </div>

        {/* Building Assignment */}
        <div className="shrink-0">
          <label className="text-xxs font-black text-slate-400 uppercase tracking-widest mb-1 block">
            Buildings
          </label>
          <div className="flex flex-wrap gap-1">
            {BUILDINGS.map((b) => {
              const assigned = (preset.buildingIds ?? []).includes(b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => void toggleBuildingId(preset.id, b.id)}
                  className={`px-1.5 py-0.5 rounded text-xxs font-bold border transition-all ${
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
              <span className="text-xxs text-slate-400 italic">
                All buildings
              </span>
            )}
          </div>
        </div>

        {/* Beta Users (only show if access level is beta) */}
        {preset.accessLevel === 'beta' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <label className="text-xxs font-black text-slate-400 uppercase tracking-widest mb-1 block shrink-0">
              Beta Users
            </label>
            <div className="flex-1 overflow-y-auto space-y-0.5 mb-1.5">
              {preset.betaUsers.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between p-0.5 px-1.5 bg-blue-50/50 rounded text-xxs border border-blue-100/50"
                >
                  <span className="text-slate-700 truncate mr-2">{email}</span>
                  <button
                    onClick={() => void removeBetaUser(preset.id, email)}
                    className="text-red-600 hover:bg-red-100 p-0.5 rounded transition-colors shrink-0"
                  >
                    <X className="w-2 h-2" />
                  </button>
                </div>
              ))}
            </div>
            <form
              className="flex gap-1 shrink-0"
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
                className="flex-1 px-2 py-1 border border-slate-200 rounded text-xxs focus:outline-none focus:ring-1 focus:ring-brand-blue-primary"
              />
              <button
                type="submit"
                className="p-1 px-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-2.5 h-2.5" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

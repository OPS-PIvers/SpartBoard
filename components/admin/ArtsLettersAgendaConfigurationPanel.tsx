import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import {
  ArtsLettersAgendaGlobalConfig,
  ArtsLettersAgendaPart,
  BuildingArtsLettersAgendaDefaults,
} from '@/types';
import {
  DEFAULT_AGENDA_PARTS,
  MAX_AGENDA_PARTS,
  PART_LABEL_MAX_LENGTH,
} from '@/components/widgets/ArtsLettersAgenda/constants';
import { sanitizeAgendaParts } from '@/components/widgets/ArtsLettersAgenda/utils';
import { Card } from '@/components/common/Card';
import { BuildingSelector } from './BuildingSelector';

interface ArtsLettersAgendaConfigurationPanelProps {
  config: ArtsLettersAgendaGlobalConfig;
  onChange: (newConfig: ArtsLettersAgendaGlobalConfig) => void;
}

type ListKey = 'simpleParts' | 'detailedParts';

interface PartsEditorProps {
  title: string;
  listKey: ListKey;
  parts: ArtsLettersAgendaPart[];
  isCustom: boolean;
  onChange: (parts: ArtsLettersAgendaPart[]) => void;
}

const PartsEditor: React.FC<PartsEditorProps> = ({
  title,
  listKey,
  parts,
  isCustom,
  onChange,
}) => {
  const [newLabel, setNewLabel] = useState('');
  const atMax = parts.length >= MAX_AGENDA_PARTS;

  const add = () => {
    const label = newLabel.trim();
    if (!label || atMax) return;
    onChange([...parts, { id: crypto.randomUUID(), label }]);
    setNewLabel('');
  };

  const move = (index: number, delta: -1 | 1) => {
    const next = [...parts];
    const target = index + delta;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xxs font-bold text-slate-500 uppercase block">
          {title}
        </label>
        <span className="text-xxs text-slate-400">
          {isCustom
            ? `${parts.length} of ${MAX_AGENDA_PARTS} boxes`
            : 'Using Launch, Learn, Land'}
        </span>
      </div>
      <div className="space-y-1.5 mb-3">
        {parts.map((part, index) => (
          <div
            key={part.id}
            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 flex items-center gap-2 shadow-sm"
          >
            <input
              type="text"
              {...tourFieldAttr(
                'admin.widget-config.field',
                'arts-letters-agenda',
                `${listKey}-${part.id}`
              )}
              aria-label={`${title} box ${index + 1}`}
              value={part.label}
              maxLength={PART_LABEL_MAX_LENGTH}
              onChange={(e) =>
                onChange(
                  parts.map((p) =>
                    p.id === part.id ? { ...p, label: e.target.value } : p
                  )
                )
              }
              className="flex-1 text-xs border-none outline-none bg-transparent"
              placeholder="Box name"
            />
            <button
              type="button"
              {...tourFieldAttr(
                'admin.widget-config.field',
                'arts-letters-agenda',
                `${listKey}-up-${part.id}`
              )}
              aria-label={`Move ${part.label} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
              className="text-slate-400 hover:text-slate-700 p-0.5 shrink-0 disabled:opacity-30"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              {...tourFieldAttr(
                'admin.widget-config.field',
                'arts-letters-agenda',
                `${listKey}-down-${part.id}`
              )}
              aria-label={`Move ${part.label} down`}
              disabled={index === parts.length - 1}
              onClick={() => move(index, 1)}
              className="text-slate-400 hover:text-slate-700 p-0.5 shrink-0 disabled:opacity-30"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              {...tourFieldAttr(
                'admin.widget-config.field',
                'arts-letters-agenda',
                `${listKey}-remove-${part.id}`
              )}
              aria-label={`Remove ${part.label}`}
              disabled={parts.length === 1}
              onClick={() => onChange(parts.filter((p) => p.id !== part.id))}
              className="text-red-400 hover:text-red-600 p-0.5 shrink-0 disabled:opacity-30"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          {...tourFieldAttr(
            'admin.widget-config.field',
            'arts-letters-agenda',
            `${listKey}-new`
          )}
          aria-label={`New box for ${title}`}
          value={newLabel}
          maxLength={PART_LABEL_MAX_LENGTH}
          disabled={atMax}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={atMax ? 'Box limit reached' : 'New box name...'}
          className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none bg-white disabled:opacity-50"
        />
        <button
          type="button"
          {...tourTypeAttr('admin.widget-config.add', 'arts-letters-agenda')}
          onClick={add}
          disabled={!newLabel.trim() || atMax}
          className="flex items-center gap-1 px-3 py-1.5 text-xxs font-bold bg-brand-blue-primary text-white rounded hover:bg-brand-blue-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
    </div>
  );
};

export const ArtsLettersAgendaConfigurationPanel: React.FC<
  ArtsLettersAgendaConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);
  const canonicalId = canonicalBuildingId(selectedBuildingId);

  const buildingDefaults = canonicalizeBuildingKeyedRecord(
    config.buildingDefaults ?? {}
  );
  const current: BuildingArtsLettersAgendaDefaults = buildingDefaults[
    canonicalId
  ] ?? { buildingId: canonicalId };

  const update = (updates: Partial<BuildingArtsLettersAgendaDefaults>) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [canonicalId]: { ...current, ...updates },
      },
    });
  };

  const view = (key: ListKey) => {
    const saved = sanitizeAgendaParts(current[key]);
    return {
      parts: saved.length ? saved : DEFAULT_AGENDA_PARTS,
      isCustom: saved.length > 0,
    };
  };
  const simple = view('simpleParts');
  const detailed = view('detailedParts');

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Agenda Boxes
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-6">
        <PartsEditor
          title="Simple version"
          listKey="simpleParts"
          parts={simple.parts}
          isCustom={simple.isCustom}
          onChange={(parts) => update({ simpleParts: parts })}
        />
        <div className="border-t border-slate-200 pt-6">
          <PartsEditor
            title="Detailed version"
            listKey="detailedParts"
            parts={detailed.parts}
            isCustom={detailed.isCustom}
            onChange={(parts) => update({ detailedParts: parts })}
          />
        </div>
      </Card>
    </div>
  );
};

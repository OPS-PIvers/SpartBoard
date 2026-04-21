import React, { useState, useMemo } from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { BuildingSelector } from './BuildingSelector';
import { EmbedGlobalConfig, BuildingEmbedDefaults } from '@/types';
import { Plus, Trash2, Settings2 } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { Card } from '@/components/common/Card';

interface EmbedConfigurationPanelProps {
  config: EmbedGlobalConfig;
  onChange: (newConfig: EmbedGlobalConfig) => void;
}

export const EmbedConfigurationPanel: React.FC<
  EmbedConfigurationPanelProps
> = ({ config, onChange }) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);
  const [newUrl, setNewUrl] = useState('');

  const buildingDefaults = useMemo(
    () => config.buildingDefaults ?? {},
    [config.buildingDefaults]
  );

  const currentBuildingConfig = useMemo(
    () =>
      buildingDefaults[selectedBuildingId] ?? {
        buildingId: selectedBuildingId,
        hideUrlField: false,
        whitelistUrls: [],
      },
    [buildingDefaults, selectedBuildingId]
  );

  const handleUpdateBuilding = (updates: Partial<BuildingEmbedDefaults>) => {
    const currentDefaults = config.buildingDefaults ?? {};
    const currentConfig = currentDefaults[selectedBuildingId] ?? {
      buildingId: selectedBuildingId,
      hideUrlField: false,
      whitelistUrls: [],
    };

    onChange({
      ...config,
      buildingDefaults: {
        ...currentDefaults,
        [selectedBuildingId]: {
          ...currentConfig,
          ...updates,
        },
      },
    });
  };

  const handleAddUrl = () => {
    if (!newUrl.trim()) return;

    // basic validation to just get the domain if they entered a full URL
    let domainToAdd = newUrl.trim().toLowerCase();
    try {
      if (
        domainToAdd.startsWith('http://') ||
        domainToAdd.startsWith('https://')
      ) {
        const parsedUrl = new URL(domainToAdd);
        domainToAdd = parsedUrl.hostname;
      }
    } catch (_e) {
      // Fallback to literal if invalid URL, e.g., if they just typed "example.com"
    }

    const whitelist = currentBuildingConfig.whitelistUrls ?? [];
    if (!whitelist.includes(domainToAdd)) {
      handleUpdateBuilding({
        whitelistUrls: [...whitelist, domainToAdd],
      });
    }
    setNewUrl('');
  };

  const handleRemoveUrl = (urlToRemove: string) => {
    const whitelist = currentBuildingConfig.whitelistUrls ?? [];
    handleUpdateBuilding({
      whitelistUrls: whitelist.filter((u) => u !== urlToRemove),
    });
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block flex items-center gap-2">
          <Settings2 className="w-3 h-3" /> Configure Building Embed Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          Users in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> will
          have the following Embed widget settings:
        </p>

        {/* Toggle Allow URL */}
        <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
          <div>
            <h4 className="text-sm font-bold text-slate-700">
              Allow Website URL Mode
            </h4>
            <p className="text-xxs text-slate-500">
              When disabled, users can only use custom HTML code embeds.
            </p>
          </div>
          <Toggle
            checked={!(currentBuildingConfig.hideUrlField ?? false)}
            onChange={(checked) =>
              handleUpdateBuilding({ hideUrlField: !checked })
            }
          />
        </div>

        {/* Whitelist Manager */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-700 block">
            Whitelisted Domains
          </label>
          <p className="text-xxs text-slate-500 leading-tight">
            Domains listed here will automatically bypass embeddability checks.
            Enter hostnames like <code>example.com</code>.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
              placeholder="e.g. example.com"
              className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-blue-primary outline-none font-medium"
            />
            <button
              onClick={handleAddUrl}
              className="px-3 py-1.5 bg-brand-blue-primary text-white rounded-lg text-xs font-bold hover:bg-brand-blue-dark transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Domain
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg max-h-48 overflow-y-auto custom-scrollbar">
            {(currentBuildingConfig.whitelistUrls ?? []).length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 italic">
                No custom domains whitelisted yet.
              </div>
            ) : (
              (currentBuildingConfig.whitelistUrls ?? []).map((domain) => (
                <div
                  key={domain}
                  className="flex items-center justify-between p-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                >
                  <span className="text-xs font-medium text-slate-700">
                    {domain}
                  </span>
                  <button
                    onClick={() => handleRemoveUrl(domain)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

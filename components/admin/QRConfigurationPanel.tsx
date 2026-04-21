import React from 'react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { BuildingSelector } from './BuildingSelector';
import { QRGlobalConfig, BuildingQRDefaults } from '@/types';
import { QrCode, Link, Palette } from 'lucide-react';
import { Card } from '@/components/common/Card';

interface QRConfigurationPanelProps {
  config: QRGlobalConfig;
  onChange: (newConfig: QRGlobalConfig) => void;
}

export const QRConfigurationPanel: React.FC<QRConfigurationPanelProps> = ({
  config,
  onChange,
}) => {
  const BUILDINGS = useAdminBuildings();
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);

  const buildingDefaults = config.buildingDefaults ?? {};
  const currentBuildingConfig: BuildingQRDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
  };

  const handleUpdateBuilding = (updates: Partial<BuildingQRDefaults>) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building QR Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <Card rounded="xl" shadow="none" className="bg-slate-50 space-y-5">
        <p className="text-xxs text-slate-500 leading-tight">
          These defaults will pre-configure the QR widget when a teacher in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> adds
          it to their dashboard.
        </p>

        {/* Default URL */}
        <div className="space-y-2">
          <label className="text-xxs font-bold text-slate-700 uppercase flex items-center gap-1.5">
            <Link className="w-3.5 h-3.5 text-slate-400" /> Default URL
          </label>
          <input
            type="text"
            value={currentBuildingConfig.defaultUrl ?? ''}
            onChange={(e) =>
              handleUpdateBuilding({
                defaultUrl: e.target.value || undefined,
              })
            }
            placeholder="e.g. https://google.com"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary outline-none transition-all"
          />
          <p className="text-xxs text-slate-400 font-medium">
            The initial link applied to new QR widgets. Users can still change
            this in their widget settings.
          </p>
        </div>

        {/* Global Branding (Admin Only) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <Palette className="w-4 h-4 text-brand-blue-primary" />
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
              Branding & Style Locks (Admin Only)
            </h4>
          </div>
          <p className="text-xxs text-slate-500 leading-relaxed">
            These color settings are enforced globally and <b>cannot</b> be
            changed by standard users. Use these to create branded QR codes.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Foreground Color */}
            <div className="space-y-2">
              <label className="text-xxs font-bold text-slate-600 uppercase">
                QR Code Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={currentBuildingConfig.qrColor ?? '#000000'}
                  onChange={(e) =>
                    handleUpdateBuilding({ qrColor: e.target.value })
                  }
                  className="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0.5 bg-white"
                  title="Pick color"
                />
                <input
                  type="text"
                  value={currentBuildingConfig.qrColor ?? ''}
                  onChange={(e) =>
                    handleUpdateBuilding({
                      qrColor: e.target.value || undefined,
                    })
                  }
                  placeholder="#000000"
                  className="flex-1 px-2 py-1.5 text-xs font-mono border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
                />
                {currentBuildingConfig.qrColor && (
                  <button
                    onClick={() => handleUpdateBuilding({ qrColor: undefined })}
                    className="text-xxs text-slate-400 hover:text-red-500 font-bold transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Background Color */}
            <div className="space-y-2">
              <label className="text-xxs font-bold text-slate-600 uppercase">
                Background Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={currentBuildingConfig.qrBgColor ?? '#ffffff'}
                  onChange={(e) =>
                    handleUpdateBuilding({ qrBgColor: e.target.value })
                  }
                  className="w-8 h-8 rounded border border-slate-200 cursor-pointer p-0.5 bg-white"
                  title="Pick background color"
                />
                <input
                  type="text"
                  value={currentBuildingConfig.qrBgColor ?? ''}
                  onChange={(e) =>
                    handleUpdateBuilding({
                      qrBgColor: e.target.value || undefined,
                    })
                  }
                  placeholder="#ffffff"
                  className="flex-1 px-2 py-1.5 text-xs font-mono border border-slate-200 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
                />
                {currentBuildingConfig.qrBgColor && (
                  <button
                    onClick={() =>
                      handleUpdateBuilding({ qrBgColor: undefined })
                    }
                    className="text-xxs text-slate-400 hover:text-red-500 font-bold transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-lg flex gap-4 items-center justify-center">
            <div
              className="w-20 h-20 rounded shadow-sm border border-slate-200 flex items-center justify-center"
              style={{
                backgroundColor: currentBuildingConfig.qrBgColor ?? '#ffffff',
              }}
            >
              <QrCode
                className="w-16 h-16"
                style={{
                  color: currentBuildingConfig.qrColor ?? '#000000',
                }}
              />
            </div>
            <div className="text-xs text-slate-400 font-medium italic">
              Branding preview
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

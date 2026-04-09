import { useState, useEffect } from 'react';
import { useAuth } from '@/context/useAuth';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { EmbedGlobalConfig, BuildingEmbedDefaults } from '@/types';

export const useEmbedConfig = (widgetBuildingId?: string) => {
  const { selectedBuildings } = useAuth();
  const { subscribeToPermission, loading: permsLoading } =
    useFeaturePermissions();
  const [config, setConfig] = useState<BuildingEmbedDefaults | null>(null);

  useEffect(() => {
    const validatedBuildingId =
      widgetBuildingId && selectedBuildings?.includes(widgetBuildingId)
        ? widgetBuildingId
        : undefined;
    const buildingId = validatedBuildingId ?? selectedBuildings?.[0];

    const unsubscribe = subscribeToPermission('embed', (perm) => {
      // When no building is selected, use neutral defaults (no restrictions)
      if (!buildingId) {
        setConfig({ buildingId: '', hideUrlField: false, whitelistUrls: [] });
        return;
      }

      if (perm?.config) {
        const globalConfig = perm.config as unknown as EmbedGlobalConfig;
        const currentDefaults = globalConfig.buildingDefaults ?? {};
        const bConfig = currentDefaults[buildingId];

        if (bConfig) {
          setConfig(bConfig);
        } else {
          setConfig({
            buildingId,
            hideUrlField: false,
            whitelistUrls: [],
          });
        }
      } else {
        setConfig({
          buildingId,
          hideUrlField: false,
          whitelistUrls: [],
        });
      }
    });

    return () => unsubscribe();
  }, [widgetBuildingId, selectedBuildings, subscribeToPermission]);

  return { config, isLoading: permsLoading || !config };
};

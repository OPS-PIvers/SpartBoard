import { useState, useEffect } from 'react';
import { useAuth } from '@/context/useAuth';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { EmbedGlobalConfig, BuildingEmbedDefaults } from '@/types';

export const useEmbedConfig = () => {
  const { selectedBuildings } = useAuth();
  const { subscribeToPermission, loading: permsLoading } =
    useFeaturePermissions();
  const [config, setConfig] = useState<BuildingEmbedDefaults | null>(null);

  useEffect(() => {
    // We default to the first selected building, or a fallback if none
    const buildingId = selectedBuildings?.[0] ?? 'schumann-elementary';

    const unsubscribe = subscribeToPermission('embed', (perm) => {
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
  }, [selectedBuildings, subscribeToPermission]);

  return { config, isLoading: permsLoading || !config };
};

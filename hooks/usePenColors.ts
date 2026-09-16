import { useCallback, useContext, useMemo } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import { getAdminBuildingConfig } from '@/utils/adminBuildingConfig';
import { resolvePenColors, toPenHex } from '@/utils/penColors';

/** The 5 pen presets every drawing toolbar shows, plus the teacher's edit actions. */
export const usePenColors = () => {
  // Optional: pens also render in hosts without an AuthProvider (defaults, no saving).
  const auth = useContext(AuthContext);
  const penColors = auth?.penColors ?? null;
  const savePenColors = auth?.savePenColors;
  const featurePermissions = auth?.featurePermissions;
  const selectedBuildings = auth?.selectedBuildings;

  const buildingColors = useMemo(
    () =>
      featurePermissions && selectedBuildings
        ? getAdminBuildingConfig(
            'drawing',
            featurePermissions,
            selectedBuildings
          ).customColors
        : undefined,
    [featurePermissions, selectedBuildings]
  );

  const colors = useMemo(
    () => resolvePenColors(penColors, buildingColors),
    [penColors, buildingColors]
  );

  const replaceColor = useCallback(
    (index: number, color: string) => {
      const hex = toPenHex(color);
      if (!savePenColors || !hex || index < 0 || index >= colors.length) {
        return;
      }
      const next = [...colors];
      next[index] = hex;
      savePenColors(next);
    },
    [colors, savePenColors]
  );

  const resetColors = useCallback(() => savePenColors?.(null), [savePenColors]);

  return {
    colors,
    canEdit: savePenColors !== undefined,
    isCustomized: penColors !== null,
    replaceColor,
    resetColors,
  };
};
